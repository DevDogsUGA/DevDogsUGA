import { Suspense } from "react";
import Field from "~/ui/field";
import OAuthCredentialsField from "~/components/OAuthCredentialsField";
import OAuthGateDialog from "~/components/OAuthGateDialog";
import OAuthTestAccountsField from "~/components/OAuthTestAccountsField";
import PageShell from "~/components/PageShell";
import { CardSkeleton } from "~/components/Skeletons";
import { ConsoleCard } from "~/ui/card";
import { getOAuthPageData } from "~/server/loaders/console";

interface Props {
  searchParams: Promise<Record<string, string>>;
}

async function OAuthData({ searchParams }: Props) {
  const [data, { add_redirect_uri: prefillRedirectUri }] = await Promise.all([
    getOAuthPageData(),
    searchParams,
  ]);

  return (
    <>
      <OAuthGateDialog
        key={data.clientId ?? "disabled"}
        clientId={data.clientId}
        hasGithub={data.hasGithub}
      />

      <ConsoleCard.Root id="credentials">
        <ConsoleCard.Header title="Credentials" />
        <ConsoleCard.Content>
          <Field
            id="client-credentials"
            label="Client ID"
            description="Copy these into your project's environment variables to enable DevDogs sign-in locally."
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
            description="Sandboxed identities you can sign in as during the OAuth flow, without using your real DevDogs account."
          >
            <OAuthTestAccountsField {...data} />
          </Field>
        </ConsoleCard.Content>
      </ConsoleCard.Root>
    </>
  );
}

export default function OAuthPage({ searchParams }: Props) {
  return (
    <PageShell
      accent="cyan"
      title="OAuth"
      description="Set up a local OAuth client to test DevDogs sign-in from your own project."
    >
      {/* The page itself awaits nothing: `searchParams` goes down as the promise
          it already is, because awaiting it here would suspend the shell along
          with the data and put the title behind the same wait. */}
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
  );
}
