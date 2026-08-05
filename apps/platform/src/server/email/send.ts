import { render, type Templates } from "@devdogsuga/email";
import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Sending, through the Cloudflare Workers `send_email` binding.
 *
 * **Not Supabase.** Its email is auth-transactional only — it fires on signup
 * confirmation, magic link and password recovery, and there is no
 * general-purpose send API to call. Reaching for `inviteUserByEmail` to get
 * around that is worse than it looks: it provisions an `auth.users` row, so a
 * team invitation would create an account for somebody who already has one, or
 * for a teammate who never accepts.
 *
 * The platform already runs on Workers via OpenNext, so the binding costs one
 * line of config and no new vendor, no API key, and no secret to rotate.
 */

export const SENDER = {
  email: "noreply@mail.devdogsuga.org",
  name: "DevDogs",
} as const;

/**
 * Why a send failed, in the terms the caller has to branch on.
 *
 * `suppressed` is the one that matters. It means the address previously
 * bounced or reported spam, so the message will never arrive no matter how
 * many times the cron retries — and the lead should be told their invitee
 * cannot be reached rather than left waiting. Swallowing it produces an
 * invitation that looks sent forever.
 */
export type SendFailure =
  | "not_configured"
  | "suppressed"
  | "sender_not_verified"
  | "unknown";

export type SendResult =
  | { ok: true }
  | { ok: false; reason: SendFailure; message: string };

interface EmailBinding {
  send(message: {
    to: string;
    from: { email: string; name?: string };
    subject: string;
    html: string;
    text: string;
  }): Promise<unknown>;
}

function binding(): EmailBinding | null {
  try {
    const { env } = getCloudflareContext();
    const email = (env as unknown as { EMAIL?: EmailBinding }).EMAIL;
    return email ?? null;
  } catch {
    // Outside a Worker — `next dev` without `--experimental-https`, a test, a
    // script. Not an error: the caller decides whether a missing binding is
    // fatal, and for an invitation it is not.
    return null;
  }
}

/** Whether sending could work at all, for the console to branch on. */
export function isEmailConfigured(): boolean {
  return binding() !== null;
}

/**
 * Renders a template and sends it to one address.
 *
 * Deliberately returns a result rather than throwing. Every caller of this is
 * a side effect after a committed write — the invite row is the source of
 * truth and the email is the notification — so a failure has to be recorded
 * and retried, not unwound.
 */
export async function sendTemplate<K extends keyof Templates>(
  to: string,
  name: K,
  props: Templates[K],
): Promise<SendResult> {
  const email = binding();
  if (!email) {
    return {
      ok: false,
      reason: "not_configured",
      message:
        "No EMAIL binding. Add it to wrangler.jsonc and run " +
        "`wrangler email sending enable mail.devdogsuga.org`.",
    };
  }

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
 * binding, and more importantly a shared recipient list would put every
 * invitee's address in front of every other invitee. Re-forming a team fans
 * out one invite per member, which at a cap of four is never close to the
 * 50-recipient limit — but fan-out is the shape that eventually reaches it,
 * so this is sequential rather than a `Promise.all` that would burst straight
 * through the rate limit.
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
