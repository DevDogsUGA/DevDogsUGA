import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { approveDevice, denyDevice } from "~/server/actions/oauthDevice";
import { expectUserWith } from "~/server/auth";
import { formatUserCode, normalizeUserCode } from "~/server/oauth/deviceCodes";
import { verifyDeviceUserCode } from "~/server/oauth/verifyDeviceCode";
import ConnectCard from "../ConnectCard";
import { approvalPath } from "../approvalPath";
import FormButton from "~/components/FormButton";
import { Button } from "~/ui/button";
import Callout from "~/ui/callout";
import { CodeInput } from "~/ui/code-input";
import { DefinitionList } from "~/ui/definition-list";

/**
 * The verification half of `devtools oauth`'s device-code fallback (RFC
 * 8628 §3.3): a page a signed-in member opens by hand -- either bare, or
 * pre-filled via `verification_uri_complete` -- to confirm the short code
 * their CLI printed and approve or deny minting a client for it. The other
 * two legs, `POST /oauth/device/code` (issuing) and
 * `POST /oauth/device/token` (the CLI's poll), never render anything;
 * this is the one piece of the handoff a human sees.
 *
 * The page requires a profile and preserves its full query string through
 * the sign-in round trip, including a pre-filled `user_code`.
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

function InfoCard({ title, message }: { title: string; message: string }) {
  return (
    <ConnectCard title={title}>
      <Callout tone="info">{message}</Callout>
    </ConnectCard>
  );
}

/**
 * The code entry: the segmented eight-character field (`checkin.html`'s code
 * input), submitted as a plain GET so the page works without script. The
 * field's value rides in a hidden `user_code` input as `XXXXXXXX`; the dash
 * the member sees is cosmetic and `normalizeUserCode` accepts either form.
 */
function CodeEntryForm({ error }: { error?: string }) {
  return (
    <ConnectCard
      title="Connect a CLI"
      description="Enter the code shown in your terminal."
    >
      <form method="get" className="flex flex-col gap-5">
        {error && (
          <Callout tone="critical" alert>
            {error}
          </Callout>
        )}
        <CodeInput
          length={8}
          name="user_code"
          aria-label="Device code"
          className="[&_input]:w-full [&_input]:min-w-0"
          invalid={Boolean(error)}
        />
        <div>
          <Button type="submit">Continue</Button>
        </div>
      </form>
    </ConnectCard>
  );
}

const INVALID_CODE_MESSAGE = "That code is invalid or has expired.";

export default async function OAuthDevicePage({ searchParams }: Props) {
  const params = await searchParams;
  const callbackPath = approvalPath("/oauth/device", params);
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
  const rawUserCode = raw.user_code ?? "";

  if (!rawUserCode) {
    return <CodeEntryForm />;
  }

  const normalized = normalizeUserCode(rawUserCode);
  if (!normalized) {
    return <CodeEntryForm error={INVALID_CODE_MESSAGE} />;
  }

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
    <ConnectCard
      title="Connect an OAuth client"
      description={`Approve to create a new DevDogs OAuth client labelled "${row.label}" and hand its credentials to the CLI that requested this code.`}
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
              { term: "Code", detail: formatUserCode(normalized) },
              { term: "Label", detail: row.label },
              { term: "Callback", detail: callbackHost },
            ]}
          />

          <p className="help" style={{ margin: 0 }}>
            This creates a new OAuth client and sends its secret back to the CLI
            that requested this code. You can revoke it any time from{" "}
            <Link href="/settings/oauth" className="textlink">
              OAuth apps
            </Link>
            .
          </p>

          <div className="flex items-center gap-3">
            <form action={approveDevice}>
              <input type="hidden" name="userCode" value={normalized} />
              <FormButton theme="cyan" type="submit">
                Approve
              </FormButton>
            </form>

            <form action={denyDevice}>
              <input type="hidden" name="userCode" value={normalized} />
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
