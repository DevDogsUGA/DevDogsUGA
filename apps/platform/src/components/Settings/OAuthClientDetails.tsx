"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowsClockwiseIcon,
  CheckIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react/ssr";
import FormButton from "~/components/FormButton";
import Input from "~/components/Input";
import OAuthModerationField from "~/components/OAuthModerationField";
import AppLogoField from "~/components/Settings/AppLogoField";
import {
  MAX_REDIRECT_URIS,
  REDIRECT_RULE_HELP,
} from "~/components/Settings/redirectUris";
import { success } from "~/lib/actionResult";
import {
  addRedirectUri,
  deleteOAuthClient,
  regenerateOAuthSecret,
  removeRedirectUri,
} from "~/server/actions/oauth";
import { saveAppDetails } from "~/server/actions/oauthApps";
import { forgetApproval } from "~/server/actions/oauthStatus";
import type { TestAccount } from "~/server/actions/testAccounts";
import type { OAuthClientSummary } from "~/server/loaders/console";
import type { ClientModeration } from "~/server/loaders/oauthModeration";
import { Panel } from "~/ui/app-shell";
import Callout from "~/ui/callout";
import { Button } from "~/ui/button";
import ConfirmDestructiveAction from "~/ui/confirm-destructive-action";
import SettingsField from "~/ui/settings-field";
import { SettingsFormProvider } from "~/ui/settings-form";
import SettingsSaveBar from "~/ui/settings-save-bar";
import { CommandFeedback, useCommand } from "~/ui/use-command";

interface Props {
  client: OAuthClientSummary;
  /** The signed-in member's test accounts, each with a Forget approval button. */
  testAccounts: TestAccount[];
  moderation: ClientModeration;
  /**
   * An officer editing a DevDogs app (Console → Apps): no owner, so no test
   * accounts, and the details help speaks of the app rather than "your app".
   */
  devDogsApp?: boolean;
}

/**
 * The body of `/dashboard/oauth/<id>`: one OAuth client, edited on its own page
 * where it used to be a drawer. Redirect URIs, regenerate and delete are
 * Commands, each of the destructive ones behind a named confirm.
 * A fresh secret is shown once, inline, until the member presses Done. The
 * homepage and privacy policy, and the moderation endpoint, are Draft fields
 * held by the page's one save bar. Deleting the app leaves for the list,
 * because this page has nothing left to show.
 */
export default function OAuthClientDetails({
  client,
  testAccounts,
  moderation,
  devDogsApp = false,
}: Props) {
  const router = useRouter();
  const addUri = useCommand(addRedirectUri);
  const removeUri = useCommand(removeRedirectUri);
  const regenerate = useCommand(regenerateOAuthSecret);
  // The page ends with the app, so there is nothing to refresh after a delete.
  const remove = useCommand(
    async (clientId: string) => {
      const result = await deleteOAuthClient(clientId);
      if (result.ok) router.replace("/dashboard/oauth");
      return result;
    },
    { refresh: false },
  );
  const isPending =
    addUri.pending || removeUri.pending || regenerate.pending || remove.pending;

  // The secret the member has already acknowledged, so Done hides it for good.
  const [acknowledged, setAcknowledged] = useState<string | null>(null);
  const secret = regenerate.result?.ok
    ? (regenerate.result.data?.clientSecret ?? null)
    : null;
  const revealed = secret !== null && secret !== acknowledged ? secret : null;
  const published = client.status === "in_production";
  // Q178: a member's published app keeps its branding until an officer returns
  // it to Testing. An officer editing a DevDogs app is not locked out.
  const brandingLocked = published && !devDogsApp;

  return (
    <SettingsFormProvider>
      <Panel id="credentials" title="Credentials">
        <div className="field">
          <span className="label">Client name</span>
          <Input value={client.label} readOnly aria-label="Client name" />
        </div>

        <div className="field">
          <label className="label" htmlFor="oauth-client-cid">
            Client ID
          </label>
          <Input id="oauth-client-cid" mono copy value={client.clientId} />
          <span className="help">
            Read-only. Safe to put in your project&rsquo;s environment
            variables.
          </span>
        </div>

        {revealed !== null ? (
          <div className="field">
            <label className="label" htmlFor="oauth-client-secret">
              New client secret
            </label>
            <Input id="oauth-client-secret" mono copy value={revealed} />
            <Callout tone="warning" alert title="You won't see this again.">
              Copy it now. It is hidden for good when you press Done.
            </Callout>
            <div>
              <Button type="button" onClick={() => setAcknowledged(revealed)}>
                <CheckIcon aria-hidden />
                Done
              </Button>
            </div>
          </div>
        ) : (
          <div className="field">
            <span className="label">Client secret</span>
            <p className="small muted" style={{ margin: 0 }}>
              Hidden. Secrets can&rsquo;t be read after they&rsquo;re generated.
              To get a new one, use Regenerate under Danger zone below.
            </p>
          </div>
        )}
      </Panel>

      <Panel id="redirect-uris" title="Redirect URIs">
        <div className="field">
          <span className="label">
            Redirect URIs{" "}
            <span className="muted" style={{ fontWeight: 400 }}>
              · {client.redirectUris.length} of {MAX_REDIRECT_URIS}
            </span>
          </span>
          <ul>
            {client.redirectUris.map((uri) => (
              <li key={uri} className="set-uri">
                <Input mono value={uri} readOnly aria-label={uri} />
                <form
                  action={() => removeUri.run(client.clientId, uri)}
                  className="contents"
                >
                  <button
                    type="submit"
                    className="iconbtn"
                    aria-label={`Remove ${uri}`}
                    disabled={isPending || client.redirectUris.length <= 1}
                  >
                    <TrashIcon aria-hidden />
                  </button>
                </form>
              </li>
            ))}
          </ul>
          {client.redirectUris.length < MAX_REDIRECT_URIS && (
            <form
              action={(formData) => {
                const uri = formData.get("uri");
                addUri.run(client.clientId, typeof uri === "string" ? uri : "");
              }}
              className="set-uri"
            >
              <Input
                mono
                name="uri"
                type="url"
                aria-label="New redirect URI"
                placeholder="http://127.0.0.1:54321/auth/v1/callback"
                required
              />
              <FormButton theme="black" type="submit" size="sm">
                <PlusIcon aria-hidden />
                Add URI
              </FormButton>
            </form>
          )}
          <CommandFeedback result={addUri.result} />
          <CommandFeedback result={removeUri.result} />
          <span className="help">{REDIRECT_RULE_HELP} At least one.</span>
        </div>
      </Panel>

      <Panel
        id="app-details"
        title="App details"
        help={
          devDogsApp
            ? "Shown on the consent screen. The app can be published only once it has a logo, a homepage and a privacy policy."
            : "Shown on the consent screen. All three are optional while your app is in Testing, but an officer can publish it only once it has a logo, a homepage and a privacy policy."
        }
      >
        {brandingLocked ? (
          <LockedBranding client={client} />
        ) : (
          <>
            <AppLogoField
              clientId={client.clientId}
              label={client.label}
              logoUrl={client.logoUrl}
            />
            <div className="fields">
              <AppLinkField
                clientId={client.clientId}
                field="homepageUrl"
                label="Homepage"
                initial={client.homepageUrl ?? ""}
                placeholder="https://my-app.example.com"
              />
              <AppLinkField
                clientId={client.clientId}
                field="privacyPolicyUrl"
                label="Privacy policy"
                initial={client.privacyPolicyUrl ?? ""}
                placeholder="https://my-app.example.com/privacy"
                help="https addresses only."
              />
            </div>
          </>
        )}
      </Panel>

      {!devDogsApp && (
        <Panel id="test-accounts" title="Test accounts">
          <TestAccountApprovals client={client} testAccounts={testAccounts} />
        </Panel>
      )}

      <Panel
        id="moderation"
        title="Moderation"
        help="Sign reports from your app's backend, and receive the decisions moderators make. Reports from an app in Testing land in the sandbox below, never in the moderators' queue."
      >
        <OAuthModerationField clients={[moderation]} />
      </Panel>

      <Panel id="danger-zone" title="Danger zone">
        <p className="help" style={{ margin: "0 0 12px" }}>
          These act right away, after you confirm.
        </p>
        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          <ConfirmDestructiveAction
            action={() => regenerate.run(client.clientId)}
            title={`Regenerate secret for ${client.label}?`}
            description={
              published
                ? "The current secret stops working immediately. Members cannot sign in to that app until it has the new secret. The new secret is shown once."
                : "The current secret stops working immediately. Any project still using it can't sign members in until you paste the new one. The new secret is shown once."
            }
            submitLabel="Regenerate secret"
          >
            <FormButton
              theme="rose"
              variant="destructive"
              size="sm"
              type="submit"
              disabled={isPending}
            >
              <ArrowsClockwiseIcon aria-hidden />
              Regenerate secret…
            </FormButton>
          </ConfirmDestructiveAction>

          <ConfirmDestructiveAction
            action={() => remove.run(client.clientId)}
            title="Delete OAuth app"
            description={`Deleting "${client.label}" removes its client ID and secret and signs out every other member who approved it. Your own sessions and test accounts are not signed out by this. Any project using the credentials loses access immediately.`}
            submitLabel="Delete app"
          >
            <FormButton
              theme="rose"
              variant="destructive"
              size="sm"
              type="submit"
              disabled={isPending}
            >
              Delete app…
            </FormButton>
          </ConfirmDestructiveAction>
        </div>
        <CommandFeedback result={regenerate.result} />
        <CommandFeedback result={remove.result} />
      </Panel>
      <SettingsSaveBar />
    </SettingsFormProvider>
  );
}

/** The logo, homepage and privacy policy of a published app, read-only (Q178). */
function LockedBranding({ client }: { client: OAuthClientSummary }) {
  return (
    <>
      <Callout tone="info" title="Locked while in production">
        The logo, homepage and privacy policy can&rsquo;t change while{" "}
        {client.label} is in production. Ask an officer to return it to Testing
        first.
      </Callout>
      <div className="field">
        <span className="label">Logo</span>
        {client.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={client.logoUrl}
            alt={`${client.label} logo`}
            width={64}
            height={64}
            className="size-16 rounded-md object-cover"
          />
        ) : (
          <p className="small muted" style={{ margin: 0 }}>
            No logo.
          </p>
        )}
      </div>
      <div className="field">
        <span className="label">Homepage</span>
        <Input
          mono
          readOnly
          value={client.homepageUrl ?? ""}
          aria-label="Homepage"
        />
      </div>
      <div className="field">
        <span className="label">Privacy policy</span>
        <Input
          mono
          readOnly
          value={client.privacyPolicyUrl ?? ""}
          aria-label="Privacy policy"
        />
      </div>
    </>
  );
}

/**
 * One of the app's links as a Draft field. Each link saves on its own, so the
 * server's `fieldErrors` land under the link it refused.
 */
function AppLinkField({
  clientId,
  field,
  label,
  initial,
  placeholder,
  help,
}: {
  clientId: string;
  field: "homepageUrl" | "privacyPolicyUrl";
  label: string;
  initial: string;
  placeholder: string;
  help?: string;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);

  return (
    <SettingsField
      id={field}
      label={label}
      draft={draft}
      isDirty={draft !== saved}
      error={null}
      reset={() => setDraft(saved)}
      save={async () => {
        const result = await saveAppDetails(clientId, { [field]: draft });
        if (result.ok) {
          setSaved(draft);
          router.refresh();
        }
        return result;
      }}
    >
      <label className="field">
        <span className="label">{label}</span>
        <Input
          mono
          type="url"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={placeholder}
        />
        {help && <span className="help">{help}</span>}
      </label>
    </SettingsField>
  );
}

/**
 * Each of the member's test accounts, with Forget approval: the account signs
 * in to this app again from the consent screen, as if for the first time.
 */
function TestAccountApprovals({
  client,
  testAccounts,
}: {
  client: OAuthClientSummary;
  testAccounts: TestAccount[];
}) {
  if (testAccounts.length === 0) {
    return (
      <p className="help" style={{ margin: 0 }}>
        You have no test accounts yet. Add one under{" "}
        <Link href="/dashboard/oauth#test-accounts" className="textlink">
          Test accounts
        </Link>
        .
      </p>
    );
  }

  return (
    <div className="set-rows" role="list">
      {testAccounts.map((account) => (
        <TestAccountApproval
          key={account.userId}
          client={client}
          account={account}
        />
      ))}
    </div>
  );
}

/** One test account's Forget approval Command. */
function TestAccountApproval({
  client,
  account,
}: {
  client: OAuthClientSummary;
  account: TestAccount;
}) {
  const { run, pending, result } = useCommand(async () => {
    const outcome = await forgetApproval(client.clientId, account.userId);
    return outcome.ok
      ? success(undefined, `Forgot ${account.displayName}'s approval`)
      : outcome;
  });
  const approved = client.approvedTestAccountIds.includes(account.userId);
  return (
    <div role="listitem" className="arow">
      <div className="min-w-0">
        <b className="truncate">{account.displayName}</b>
        <span className="small muted">
          {approved ? "Approved this app" : "Not approved yet"}
        </span>
      </div>
      <div className="end shrink-0">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!approved || pending}
          aria-label={`Forget approval for ${account.displayName}`}
          onClick={() => run()}
        >
          Forget approval
        </Button>
      </div>
      <CommandFeedback result={result} />
    </div>
  );
}
