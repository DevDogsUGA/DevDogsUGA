import type { Metadata } from "next";
import { Suspense } from "react";
import DiscordField from "~/components/ConnectedAccountField/DiscordField";
import EmailField from "~/components/EmailField";
import GithubField from "~/components/ConnectedAccountField/GithubField";
import LinkedinField from "~/components/ConnectedAccountField/LinkedinField";
import SettingsAnchor from "~/components/Settings/SettingsAnchor";
import SettingsShell from "~/components/Settings/SettingsShell";
import VerificationStatusField from "~/components/VerificationStatusField";
import ConnectedAppsField from "~/components/Settings/ConnectedAppsField";
import { getProfilePageData } from "~/server/loaders/console";
import { getConnectedApps } from "~/server/loaders/oauthApps";
import { PageHeading, Panel } from "~/ui/app-shell";
import Callout from "~/ui/callout";
import { Skeleton } from "~/ui/skeleton";
import { TextLink } from "~/ui/text-link";

export const metadata: Metadata = {
  title: "Connected accounts | Settings | DevDogs",
  robots: { index: false },
};

const PATH = "/settings/accounts";

type Params = Record<string, string | string[] | undefined>;

/** What the link round trip reported, as the three results the page can show. */
function LinkResult({ params }: { params: Params }) {
  const level = params.connectedAccountStatus;
  const code = params.connectedAccountCode;
  const provider = params.connectedAccountProvider;
  if (typeof level !== "string" || typeof code !== "string") return null;

  const providerName =
    provider === "github"
      ? "GitHub"
      : provider === "discord"
        ? "Discord"
        : provider === "linkedin_oidc"
          ? "LinkedIn"
          : "That account";
  const message =
    code === "identity_already_exists"
      ? `${providerName} profile is already linked to a DevDogs account. If it does not appear below, sign in to the other account and unlink it first, or contact an officer for help.`
      : code === "external_side_effect_failed"
        ? `${providerName} was linked, but its server membership could not be updated. Your connected account is safe; an officer can retry the membership update.`
        : `${providerName} could not be linked. Please try again or contact an officer if the problem continues.`;

  return (
    <Callout tone={level === "warning" ? "warning" : "critical"} alert>
      {message}
    </Callout>
  );
}

async function AccountsContent() {
  const [data, connectedApps] = await Promise.all([
    getProfilePageData(),
    getConnectedApps(),
  ]);
  return (
    <>
      <Panel id="accounts" title="Accounts">
        <div className="set-rows">
          <SettingsAnchor
            id="email"
            label="UGA MyID Email"
            description="Obtained via UGA SSO and used for sign-in. This can't be changed here."
          >
            <EmailField {...data} />
          </SettingsAnchor>
          <SettingsAnchor
            id="github"
            label="GitHub"
            description="Linking GitHub is part of verifying your account and is needed to create an OAuth client for testing DevDogs sign-in. You contribute from your own fork, so it does not add you to the DevDogs organization."
          >
            <GithubField {...data} />
          </SettingsAnchor>
          <SettingsAnchor
            id="discord"
            label="Discord"
            description="Linking Discord adds you to the DevDogs Discord server."
          >
            <DiscordField {...data} />
          </SettingsAnchor>
          <SettingsAnchor
            id="linkedin"
            label="LinkedIn"
            description="Link your LinkedIn profile to display it on your public profile."
          >
            <LinkedinField {...data} />
          </SettingsAnchor>
        </div>
      </Panel>

      <Panel
        id="connected-apps"
        title="Connected apps"
        help="Apps you have approved to sign you in with DevDogs. Remove access to sign out of one app and make it ask again."
      >
        <ConnectedAppsField apps={connectedApps} userId={data.id} />
      </Panel>

      <Panel
        id="verification"
        title="Verification"
        help="Complete all the steps below for your profile to appear on the DevDogs community page. You don't need to be verified to check in; checking in only needs your UGA sign-in."
      >
        <div className="set-rows">
          <VerificationStatusField />
        </div>
      </Panel>
    </>
  );
}

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;
  return (
    <SettingsShell current={PATH}>
      <PageHeading
        title="Connected accounts"
        description={
          <>
            How you sign in, and what each account unlocks. Linking and
            unlinking happen right away, and each asks first. What your profile
            shows is set on{" "}
            <TextLink href="/settings/profile#publicProfileSettings">
              Profile
            </TextLink>
            .
          </>
        }
      />
      <LinkResult params={params} />
      <Suspense fallback={<Skeleton className="h-64 w-full max-w-[720px]" />}>
        <AccountsContent />
      </Suspense>
    </SettingsShell>
  );
}
