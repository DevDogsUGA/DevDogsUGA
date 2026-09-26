import type { Metadata } from "next";
import Link from "next/link";
import { approveDevice, denyDevice } from "~/server/actions/oauthDevice";
import { authenticate, expectUserWith } from "~/server/auth";
import { formatUserCode, normalizeUserCode } from "~/server/oauth/deviceCodes";
import { verifyDeviceUserCode } from "~/server/oauth/verifyDeviceCode";
import PageShell from "~/components/PageShell";
import { ConsoleCard } from "~/ui/card";
import FormButton from "~/components/FormButton";

/**
 * The verification half of `devtools oauth`'s device-code fallback (RFC
 * 8628 §3.3): a page a signed-in member opens by hand -- either bare, or
 * pre-filled via `verification_uri_complete` -- to confirm the short code
 * their CLI printed and approve or deny minting a client for it. The other
 * two legs, `POST /tools/oauth/device/code` (issuing) and
 * `POST /tools/oauth/device/token` (the CLI's poll), never render anything;
 * this is the one piece of the handoff a human sees.
 *
 * Reached only while signed in: `../../layout.tsx` redirects a signed-out
 * visitor to `/auth?callbackPath=...` using the `x-request-path` header
 * `~/middleware.ts` sets from the full pathname *and query string*, so a
 * `?user_code=...` survives the sign-in round trip.
 */
export const metadata: Metadata = {
  title: "Connect | DevDogs",
  robots: { index: false },
};

interface Props {
  searchParams: Promise<Record<string, string | undefined>>;
}

function ErrorCard({ message }: { message: string }) {
  return (
    <PageShell accent="rose" title="Can't connect">
      <ConsoleCard.Root>
        <ConsoleCard.Content>
          <p className="text-sm text-mauve-300">{message}</p>
        </ConsoleCard.Content>
      </ConsoleCard.Root>
    </PageShell>
  );
}

function InfoCard({ title, message }: { title: string; message: string }) {
  return (
    <PageShell accent="cyan" title={title}>
      <ConsoleCard.Root>
        <ConsoleCard.Content>
          <p className="text-sm text-mauve-300">{message}</p>
        </ConsoleCard.Content>
      </ConsoleCard.Root>
    </PageShell>
  );
}

function CodeEntryForm({ error }: { error?: string }) {
  return (
    <PageShell
      accent="cyan"
      title="Connect a CLI"
      description="Enter the code shown in your terminal."
    >
      <ConsoleCard.Root>
        <ConsoleCard.Content>
          <form
            method="get"
            className="flex flex-col gap-4 py-2 text-sm text-mauve-300"
          >
            {error && <p className="text-rose-400">{error}</p>}
            <input
              type="text"
              name="user_code"
              placeholder="XXXX-XXXX"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              className="rounded-sm border-2 border-mauve-700 bg-transparent px-4 py-2 text-center font-mono text-lg tracking-widest text-white uppercase outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            />
            <button
              type="submit"
              className="rounded-sm border-2 border-cyan-400 bg-cyan-400 px-4 py-1.5 text-sm font-medium text-black transition outline-none hover:bg-mauve-950 hover:text-cyan-400 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2"
            >
              Continue
            </button>
          </form>
        </ConsoleCard.Content>
      </ConsoleCard.Root>
    </PageShell>
  );
}

const INVALID_CODE_MESSAGE = "That code is invalid or has expired.";

export default async function OAuthDevicePage({ searchParams }: Props) {
  const raw = await searchParams;
  const rawUserCode = raw.user_code ?? "";

  if (!rawUserCode) {
    return <CodeEntryForm />;
  }

  const normalized = normalizeUserCode(rawUserCode);
  if (!normalized) {
    return <CodeEntryForm error={INVALID_CODE_MESSAGE} />;
  }

  // The tools layout already requires a session before this page renders,
  // but a session can lapse between that check and this render (or between
  // this render and the Approve/Deny form post below) -- the `.catch` here
  // re-authenticates with a callback path specific to this code, same
  // pattern as the loopback connect page.
  const callbackPath = `/tools/oauth/device?${new URLSearchParams({ user_code: formatUserCode(normalized) }).toString()}`;
  const user = await expectUserWith({
    githubIdentity: { columns: { id: true } },
  }).catch(() => authenticate("google", callbackPath));

  const verification = await verifyDeviceUserCode({
    normalizedUserCode: normalized,
    userId: user.id,
  });

  if (verification.outcome === "rate_limited") {
    return (
      <ErrorCard message="Too many attempts. Wait a minute and try again." />
    );
  }

  if (verification.outcome === "not_found") {
    return <CodeEntryForm error={INVALID_CODE_MESSAGE} />;
  }

  const { row } = verification;

  if (row.status === "approved") {
    return (
      <InfoCard
        title="Already approved"
        message="This client is already connected. You can close this tab and return to your terminal."
      />
    );
  }

  if (row.status === "denied") {
    return (
      <InfoCard
        title="Request denied"
        message="This connection request was denied. You can close this tab."
      />
    );
  }

  const callbackHost = (() => {
    try {
      return new URL(row.callbackUri).host;
    } catch {
      return row.callbackUri;
    }
  })();

  return (
    <PageShell
      accent="cyan"
      title="Connect an OAuth client"
      description={`Approve to create a new DevDogs OAuth client labelled "${row.label}" and hand its credentials to the CLI that requested this code.`}
    >
      <ConsoleCard.Root>
        <ConsoleCard.Content>
          {!user.githubIdentity ? (
            <div className="flex flex-col items-start gap-4 py-2 text-sm text-mauve-300">
              <p>
                Connecting an OAuth client requires a linked GitHub account.
              </p>
              <Link
                href="/account#connectedAccounts"
                className="rounded-sm border-2 border-cyan-400 bg-cyan-400 px-4 py-1.5 text-sm font-medium text-black transition outline-none hover:bg-mauve-950 hover:text-cyan-400 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2"
              >
                Link GitHub Account
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-4 py-2 text-sm text-mauve-300">
              <dl className="flex flex-col gap-1">
                <div className="flex gap-2">
                  <dt className="font-medium text-white">Code</dt>
                  <dd>{formatUserCode(normalized)}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="font-medium text-white">Label</dt>
                  <dd>{row.label}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="font-medium text-white">Callback</dt>
                  <dd>{callbackHost}</dd>
                </div>
              </dl>

              <p>
                This creates a new OAuth client and sends its secret back to the
                CLI that requested this code. You can revoke it any time from
                this page under <strong>Credentials</strong>.
              </p>

              <div className="flex items-center gap-3">
                <form action={approveDevice}>
                  <input type="hidden" name="userCode" value={normalized} />
                  <FormButton theme="cyan" type="submit" className="text-sm">
                    Approve
                  </FormButton>
                </form>

                <form action={denyDevice}>
                  <input type="hidden" name="userCode" value={normalized} />
                  <FormButton theme="black" type="submit" className="text-sm">
                    Deny
                  </FormButton>
                </form>
              </div>
            </div>
          )}
        </ConsoleCard.Content>
      </ConsoleCard.Root>
    </PageShell>
  );
}
