import { render, type Templates } from "@devdogsuga/email";
import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Sending, through the Cloudflare Workers `send_email` binding.
 *
 * **Not Supabase.** Its email is auth-transactional only: signup confirmation,
 * magic link, password recovery. There is no general-purpose send API.
 * `inviteUserByEmail` is not a way around that, because it provisions an
 * `auth.users` row, so a team invitation would create an account for somebody
 * who already has one, or for a teammate who never accepts.
 *
 * The platform already runs on Workers via OpenNext, so the binding costs one
 * line of config: no new vendor, no API key, no secret to rotate.
 */

export const SENDER = {
  email: "noreply@mail.devdogsuga.org",
  name: "DevDogs",
} as const;

/**
 * Why a send failed, in the terms the caller has to branch on.
 *
 * `suppressed` is the one that matters. The address previously bounced or
 * reported spam, so no number of cron retries will deliver it. Swallow it and
 * the lead is never told their invitee cannot be reached, leaving an invitation
 * that looks sent forever.
 */
export type SendFailure =
  "not_configured" | "suppressed" | "sender_not_verified" | "unknown";

export type SendResult =
  { ok: true } | { ok: false; reason: SendFailure; message: string };

interface EmailBinding {
  send(message: {
    to: string;
    from: { email: string; name?: string };
    subject: string;
    html: string;
    text: string;
  }): Promise<unknown>;
}

/**
 * Why the binding is absent. The two cases deserve opposite reactions: outside
 * a Worker its absence is the normal state of `next dev` and every test, while
 * *inside* a Worker it means the deployment is misconfigured and mail is
 * silently not going out.
 */
type MissingBinding = "outside-worker" | "worker-unbound";

function binding():
  { email: EmailBinding } | { email: null; missing: MissingBinding } {
  try {
    const { env } = getCloudflareContext();
    const email = (env as unknown as { EMAIL?: EmailBinding }).EMAIL;
    return email ? { email } : { email: null, missing: "worker-unbound" };
  } catch {
    // Outside a Worker: `next dev` without `--experimental-https`, a test, a
    // script. Not an error. The caller decides whether a missing binding is
    // fatal, and for an invitation it is not.
    return { email: null, missing: "outside-worker" };
  }
}

/** Whether sending could work at all, for the console to branch on. */
export function isEmailConfigured(): boolean {
  return binding().email !== null;
}

// Once per process, not once per send: the binding cannot appear mid-process,
// and a line repeated across a seeding run's fan-out is noise that trains
// people to ignore it. Logs the template name and the reason, never the
// recipient address.
let announcedMissing = false;

function announceMissing(missing: MissingBinding, template: string): void {
  if (announcedMissing) return;
  announcedMissing = true;
  if (missing === "outside-worker") {
    // Expected in `next dev`, tests, and scripts, so info rather than warn.
    console.info(
      `email: skipped "${template}" — not running in a Worker, so there is ` +
        "no EMAIL binding. Preview templates with " +
        "`pnpm --filter @devdogsuga/email preview`. Further skips are silent.",
    );
  } else {
    // A deployed Worker without the binding is a real misconfiguration:
    // every send is silently failing, and only this line says so.
    console.warn(
      `email: this Worker has no EMAIL binding — "${template}" was not ` +
        "sent. Add the binding in wrangler.jsonc and run " +
        "`wrangler email sending enable mail.devdogsuga.org`. " +
        "Further failures are silent.",
    );
  }
}

/**
 * Renders a template and sends it to one address.
 *
 * Returns a result rather than throwing. Every caller is a side effect after a
 * committed write: the invite row is the source of truth, the email is the
 * notification. A failure has to be recorded and retried, not unwound.
 */
export async function sendTemplate<K extends keyof Templates>(
  to: string,
  name: K,
  props: Templates[K],
): Promise<SendResult> {
  const lookup = binding();
  if (!lookup.email) {
    announceMissing(lookup.missing, String(name));
    return {
      ok: false,
      reason: "not_configured",
      message:
        "No EMAIL binding. Add it to wrangler.jsonc and run " +
        "`wrangler email sending enable mail.devdogsuga.org`.",
    };
  }
  const email = lookup.email;

  const { subject, html, text } = render(name, props);

  try {
    await email.send({
      to,
      from: { email: SENDER.email, name: SENDER.name },
      subject,
      html,
      // Never omitted. Some clients show only the text part, and its absence
      // measurably worsens spam scoring.
      text,
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: classify(error), message: describe(error) };
  }
}

/**
 * Sends to several addresses, one call each.
 *
 * Not one call with several recipients: `to` is a single address on this
 * binding, and a shared recipient list would put every invitee's address in
 * front of every other invitee. Re-forming a team fans out one invite per
 * member, which at a cap of four never approaches the 50-recipient limit, but
 * fan-out is the shape that eventually reaches it. Hence sequential, rather
 * than a `Promise.all` that would burst through the rate limit.
 */
export async function sendEach<K extends keyof Templates>(
  recipients: { to: string; props: Templates[K] }[],
  name: K,
): Promise<Map<string, SendResult>> {
  const results = new Map<string, SendResult>();
  for (const recipient of recipients) {
    results.set(
      recipient.to,
      await sendTemplate(recipient.to, name, recipient.props),
    );
  }
  return results;
}

function classify(error: unknown): SendFailure {
  const text = describe(error);
  if (text.includes("E_RECIPIENT_SUPPRESSED")) return "suppressed";
  if (text.includes("E_SENDER_NOT_VERIFIED")) return "sender_not_verified";
  return "unknown";
}

function describe(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}
