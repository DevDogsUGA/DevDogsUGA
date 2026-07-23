import AccentBlobs from "~/ui/accent-blobs";
import Field from "~/ui/field";
import OAuthCredentialsField from "~/components/OAuthCredentialsField";
import OAuthGateDialog from "~/components/OAuthGateDialog";
import OAuthTestAccountsField from "~/components/OAuthTestAccountsField";
import PageHeader from "~/components/PageHeader";
import { ConsoleCard } from "~/ui/card";
import { getOAuthPageData } from "~/server/loaders/console";

interface Props {
  searchParams: Promise<Record<string, string>>;
}

export default async function OAuthPage({ searchParams }: Props) {
  const [data, { add_redirect_uri: prefillRedirectUri }] = await Promise.all([
    getOAuthPageData(),
    searchParams,
  ]);

  return (
    <div className="relative isolate mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 @sm:px-6">
      <AccentBlobs accent="cyan" />

      <PageHeader
        title="OAuth"
        description="Set up a local OAuth client to test DevDogs sign-in from your own project."
        accent="cyan"
      />

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
            <OAuthCredentialsField {...data} prefillRedirectUri={prefillRedirectUri} />
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
    </div>
  );
}
