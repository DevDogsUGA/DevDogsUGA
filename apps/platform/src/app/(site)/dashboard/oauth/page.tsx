import type { Metadata } from "next";
import { Suspense } from "react";
import Input from "~/classic/components/Input";
import OAuthCredentialsField from "~/classic/components/OAuthCredentialsField";
import OAuthModerationField from "~/classic/components/OAuthModerationField";
import OAuthTestAccountsField from "~/classic/components/OAuthTestAccountsField";
import PageShell from "~/classic/components/PageShell";
import { CardSkeleton } from "~/classic/components/Skeletons";
import { ConsoleCard } from "~/classic/ui/card";
import Field from "~/classic/ui/field";
import { SettingsFormProvider } from "~/classic/ui/settings-form";
import SettingsSaveBar from "~/classic/ui/settings-save-bar";
import { getOAuthPageData } from "~/server/loaders/console";
import { getOAuthModerationData } from "~/server/loaders/oauthModeration";
import { resolveIssuer } from "~/server/oauth/issuer";

export const metadata: Metadata = {
  title: "OAuth apps | Settings | DevDogs",
  robots: { index: false },
};

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

  // An app's moderation lives on its own page. What is left here is the
  // published apps a holder moderates but has no page for.
  const unpaged = moderation.filter((client) => !client.hasPage);

  return (
    <>
      <ConsoleCard.Root id="issuer">
        <ConsoleCard.Header title="Issuer URL" />
        <ConsoleCard.Content>
          <Field
            id="issuer-url"
            label="Issuer URL"
            description="Where an OpenID Connect provider (a custom OIDC provider in Supabase, for one) discovers DevDogs sign-in. Read from discovery, not typed in by hand. Copy it exactly: a provider set to any other issuer fails its issuer check."
          >
            {issuer ? (
              <Input
                mono
                copy
                className="max-w-sm"
                value={issuer}
                aria-label="Issuer URL"
              />
            ) : (
              <p className="text-sm text-mauve-400">
                Couldn&rsquo;t load the issuer right now. Try again in a moment.
              </p>
            )}
          </Field>
        </ConsoleCard.Content>
      </ConsoleCard.Root>

      <ConsoleCard.Root id="apps">
        <ConsoleCard.Header
          title="Your apps"
          description="Every app you create starts in Testing: only you and your test accounts can sign in to it. When it is ready, an officer publishes it so every member can. You keep managing it either way. Redirect URIs follow one rule: http only on localhost, 127.0.0.1 and [::1], https everywhere else. Needs a linked GitHub account."
        />
        <ConsoleCard.Content>
          <Field
            id="apps-list"
            label="OAuth apps"
            description="A logo, a homepage and a privacy policy are optional while you test. They are required before an officer can publish the app, and they are what members see on the consent screen. Open an app to add them."
          >
            <OAuthCredentialsField
              {...data}
              prefillRedirectUri={prefillRedirectUri}
            />
          </Field>
        </ConsoleCard.Content>
      </ConsoleCard.Root>

      <ConsoleCard.Root id="test-accounts">
        <ConsoleCard.Header title="Test Accounts" />
        <ConsoleCard.Content>
          <Field
            id="test-accounts-list"
            label="Test Accounts"
            description="Sandboxed identities you can sign in as during the OAuth flow, so you can test without your own account."
          >
            <OAuthTestAccountsField {...data} />
          </Field>
        </ConsoleCard.Content>
      </ConsoleCard.Root>

      <ConsoleCard.Root id="moderation">
        <ConsoleCard.Header title="Moderation" />
        <ConsoleCard.Content>
          <Field
            id="moderation-clients"
            label="Report and Block"
            description="Sign reports from your app's backend, and receive the decisions moderators make. Reports from an app in Testing land in a sandbox on its page, never in the moderators' queue."
          >
            {unpaged.length > 0 ? (
              <SettingsFormProvider>
                <OAuthModerationField clients={unpaged} />
                <SettingsSaveBar />
              </SettingsFormProvider>
            ) : (
              <p className="text-sm text-mauve-400">
                Moderation is set up per app. Open an app above to find it.
              </p>
            )}
          </Field>
        </ConsoleCard.Content>
      </ConsoleCard.Root>
    </>
  );
}

export default function OAuthPage({ searchParams }: Props) {
  return (
    <div className="flex min-w-0 flex-1 flex-col bg-mauve-900">
      <PageShell
        accent="cyan"
        title="OAuth apps"
        description="Set up an OAuth app to test DevDogs sign-in from your own project."
      >
        {/* The page itself awaits nothing: `searchParams` goes down as the
            promise it already is, because awaiting it here would suspend the
            shell along with the data and put the title behind the same wait. */}
        <Suspense
          fallback={
            <>
              <CardSkeleton rows={1} />
              <CardSkeleton rows={2} />
            </>
          }
        >
          <OAuthData searchParams={searchParams} />
        </Suspense>
      </PageShell>
    </div>
  );
}
