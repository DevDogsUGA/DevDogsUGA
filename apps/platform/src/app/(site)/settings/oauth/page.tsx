import type { Metadata } from "next";
import { Suspense } from "react";
import Input from "~/components/Input";
import OAuthCredentialsField from "~/components/OAuthCredentialsField";
import OAuthModerationField from "~/components/OAuthModerationField";
import OAuthTestAccountsField from "~/components/OAuthTestAccountsField";
import SettingsAnchor from "~/components/Settings/SettingsAnchor";
import SettingsShell from "~/components/Settings/SettingsShell";
import { getOAuthPageData } from "~/server/loaders/console";
import { getOAuthModerationData } from "~/server/loaders/oauthModeration";
import { resolveIssuer } from "~/server/oauth/issuer";
import { PageHeading, Panel } from "~/ui/app-shell";
import { Skeleton } from "~/ui/skeleton";

export const metadata: Metadata = {
  title: "OAuth apps | Settings | DevDogs",
  robots: { index: false },
};

const PATH = "/settings/oauth";

interface Props {
  searchParams: Promise<Record<string, string>>;
}

async function OAuthData({ searchParams }: Props) {
  const [data, moderation, issuer, { add_redirect_uri: prefillRedirectUri }] =
    await Promise.all([
      getOAuthPageData(),
      getOAuthModerationData(),
      // Read from discovery rather than written down: GoTrue stamps the
      // issuer it reports on every ID token, and a provider set to anything
      // else fails its issuer check (TASK-347). It is a `<project>.supabase.co`
      // host, so this follows the platform project wherever it is reached from.
      resolveIssuer().catch(() => null),
      searchParams,
    ]);

  return (
    <>
      <Panel
        id="issuer"
        title="Issuer URL"
        help="Where an OpenID Connect provider (a custom OIDC provider in Supabase, for one) discovers DevDogs sign-in."
      >
        {issuer ? (
          <div className="set-secret">
            <Input mono copy value={issuer} aria-label="Issuer URL" />
          </div>
        ) : (
          <p className="help">
            Couldn&rsquo;t load the issuer right now. Try again in a moment.
          </p>
        )}
        <p className="help" style={{ marginTop: 10, maxWidth: "62ch" }}>
          Read from discovery, not typed in by hand. Copy it exactly: a provider
          set to any other issuer fails its issuer check.
        </p>
      </Panel>

      <Panel
        id="apps"
        title="Your apps"
        help="Every app you create starts in Testing: only you and your test accounts can sign in to it. When it is ready, an officer publishes it so every member can. You keep managing it either way. Redirect URIs follow one rule: http only on localhost, 127.0.0.1 and [::1], https everywhere else. Needs a linked GitHub account."
      >
        <p className="help" style={{ marginBottom: 16, maxWidth: "62ch" }}>
          A logo, a homepage and a privacy policy are optional while you test.
          They are required before an officer can publish the app, and they are
          what members see on the consent screen. Open an app to add them.
        </p>
        <OAuthCredentialsField
          {...data}
          prefillRedirectUri={prefillRedirectUri}
        />
      </Panel>

      <Panel
        id="test-accounts"
        title="Test accounts"
        help="Sandboxed identities you can sign in as during the OAuth flow, so you can test without your own account."
      >
        <OAuthTestAccountsField {...data} />
      </Panel>

      <Panel id="moderation" title="Moderation">
        <SettingsAnchor
          id="moderation-clients"
          label="Report and Block"
          description="Sign reports from your app's backend, and receive the decisions moderators make. Reports from an app in Testing land in the sandbox below, never in the moderators' queue."
        >
          <p className="help" style={{ marginBottom: 16, maxWidth: "62ch" }}>
            Sign reports from your app&rsquo;s backend, and receive the
            decisions moderators make. Reports from an app in Testing land in
            the sandbox below, never in the moderators&rsquo; queue.
          </p>
          <OAuthModerationField clients={moderation} />
        </SettingsAnchor>
      </Panel>
    </>
  );
}

export default function OAuthPage({ searchParams }: Props) {
  return (
    <SettingsShell current={PATH}>
      <PageHeading
        title="OAuth apps"
        description="Set up an OAuth app to test DevDogs sign-in from your own project."
      />
      {/* The page itself awaits nothing: `searchParams` goes down as the promise
          it already is, because awaiting it here would suspend the shell along
          with the data and put the title behind the same wait. */}
      <Suspense fallback={<Skeleton className="h-64 w-full max-w-[720px]" />}>
        <OAuthData searchParams={searchParams} />
      </Suspense>
    </SettingsShell>
  );
}
