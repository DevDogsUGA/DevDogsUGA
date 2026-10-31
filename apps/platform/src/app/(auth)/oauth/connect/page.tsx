import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { approveConnect, denyConnect } from "~/server/actions/oauthConnect";
import { expectUserWith } from "~/server/auth";
import { parseConnectParams } from "~/server/oauth/connectParams";
import ConnectCard from "../ConnectCard";
import { approvalPath } from "../approvalPath";
import FormButton from "~/components/FormButton";
import Callout from "~/ui/callout";
import { DefinitionList } from "~/ui/definition-list";

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
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function ErrorCard({ message }: { message: string }) {
  return (
    <ConnectCard title="Can't connect">
      <Callout tone="critical" alert>
        {message}
      </Callout>
    </ConnectCard>
  );
}

export default async function OAuthConnectPage({ searchParams }: Props) {
  const params = await searchParams;
  const callbackPath = approvalPath("/oauth/connect", params);
  const user = await expectUserWith({
    profile: true,
    githubIdentity: { columns: { id: true } },
  }).catch(() =>
    redirect(`/auth?callbackPath=${encodeURIComponent(callbackPath)}`),
  );
  const raw = Object.fromEntries(
    Object.entries(params).map(([key, value]) => [
      key,
      typeof value === "string" ? value : undefined,
    ]),
  );
  const result = parseConnectParams(raw);

  // Invalid params: an error page, never a redirect. The CLI's redirect_uri
  // is exactly what a malformed request could not be trusted to send
  // someone back to.
  if (!result.ok) {
    return <ErrorCard message={result.error} />;
  }

  const { redirectUri, codeChallenge, state, label, callbackUri } =
    result.params;

  const callbackHost = (() => {
    try {
      return new URL(callbackUri).host;
    } catch {
      return callbackUri;
    }
  })();

  return (
    <ConnectCard
      title="Connect an OAuth client"
      description={`Approve to create a new DevDogs OAuth client labelled "${label}" and hand its credentials to the CLI that opened this page.`}
    >
      {!user.githubIdentity ? (
        <div className="flex flex-col items-start gap-4">
          <Callout tone="warning">
            Connecting an OAuth client requires a linked GitHub account.
          </Callout>
          <Link href="/settings/accounts#github" className="btn primary">
            Link GitHub account
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <DefinitionList
            items={[
              { term: "Label", detail: label },
              { term: "Callback", detail: callbackHost },
            ]}
          />

          <p className="help" style={{ margin: 0 }}>
            This creates a new OAuth client and sends its secret back to the CLI
            running on your machine. You can revoke it any time from{" "}
            <Link href="/settings/oauth" className="textlink">
              OAuth apps
            </Link>
            .
          </p>

          <div className="flex items-center gap-3">
            <form action={approveConnect}>
              <input type="hidden" name="redirectUri" value={redirectUri} />
              <input type="hidden" name="codeChallenge" value={codeChallenge} />
              <input type="hidden" name="state" value={state} />
              <input type="hidden" name="label" value={label} />
              <input type="hidden" name="callbackUri" value={callbackUri} />
              <FormButton theme="cyan" type="submit">
                Approve
              </FormButton>
            </form>

            <form action={denyConnect}>
              <input type="hidden" name="redirectUri" value={redirectUri} />
              <input type="hidden" name="codeChallenge" value={codeChallenge} />
              <input type="hidden" name="state" value={state} />
              <input type="hidden" name="label" value={label} />
              <input type="hidden" name="callbackUri" value={callbackUri} />
              <FormButton theme="black" variant="ghost" type="submit">
                Deny
              </FormButton>
            </form>
          </div>
        </div>
      )}
    </ConnectCard>
  );
}
