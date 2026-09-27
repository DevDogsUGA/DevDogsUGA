import type { Metadata } from "next";
import Link from "next/link";
import { approveConnect, denyConnect } from "~/server/actions/oauthConnect";
import { authenticate, expectUserWith } from "~/server/auth";
import { parseConnectParams } from "~/server/oauth/connectParams";
import PageShell from "~/components/PageShell";
import { ConsoleCard } from "~/ui/card";
import FormButton from "~/components/FormButton";

/**
 * The one-click half of `devtools oauth`: a browser tab the CLI opens with a
 * loopback redirect URI and a PKCE challenge (RFC 8252), landing here so a
 * signed-in member can approve minting a fresh OAuth client for whatever
 * project asked. Approval and the code the CLI trades for the real
 * credentials both live in `~/server/actions/oauthConnect.ts`; the query
 * string this page validates is documented in `~/server/oauth/connectParams`.
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

export default async function OAuthConnectPage({ searchParams }: Props) {
  const raw = await searchParams;
  const result = parseConnectParams(raw);

  // Invalid params: an error page, never a redirect. The CLI's redirect_uri
  // is exactly what a malformed request could not be trusted to send
  // someone back to.
  if (!result.ok) {
    return <ErrorCard message={result.error} />;
  }

  const { redirectUri, codeChallenge, state, label, callbackUri } =
    result.params;

  const callbackPath = `/tools/oauth/connect?${new URLSearchParams({
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
    label,
    callback_uri: callbackUri,
  }).toString()}`;

  const user = await expectUserWith({
    githubIdentity: { columns: { id: true } },
  }).catch(() => authenticate("google", callbackPath));

  const callbackHost = (() => {
    try {
      return new URL(callbackUri).host;
    } catch {
      return callbackUri;
    }
  })();

  return (
    <PageShell
      accent="cyan"
      title="Connect an OAuth client"
      description={`Approve to create a new DevDogs OAuth client labelled "${label}" and hand its credentials to the CLI that opened this page.`}
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
                  <dt className="font-medium text-white">Label</dt>
                  <dd>{label}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="font-medium text-white">Callback</dt>
                  <dd>{callbackHost}</dd>
                </div>
              </dl>

              <p>
                This creates a new OAuth client and sends its secret back to the
                CLI running on your machine. You can revoke it any time from
                this page under <strong>Credentials</strong>.
              </p>

              <div className="flex items-center gap-3">
                <form action={approveConnect}>
                  <input type="hidden" name="redirectUri" value={redirectUri} />
                  <input
                    type="hidden"
                    name="codeChallenge"
                    value={codeChallenge}
                  />
                  <input type="hidden" name="state" value={state} />
                  <input type="hidden" name="label" value={label} />
                  <input type="hidden" name="callbackUri" value={callbackUri} />
                  <FormButton theme="cyan" type="submit" className="text-sm">
                    Approve
                  </FormButton>
                </form>

                <form action={denyConnect}>
                  <input type="hidden" name="redirectUri" value={redirectUri} />
                  <input
                    type="hidden"
                    name="codeChallenge"
                    value={codeChallenge}
                  />
                  <input type="hidden" name="state" value={state} />
                  <input type="hidden" name="label" value={label} />
                  <input type="hidden" name="callbackUri" value={callbackUri} />
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
