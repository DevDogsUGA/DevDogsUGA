"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowsClockwiseIcon,
  CheckIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react/ssr";
import FormButton from "~/components/FormButton";
import Input from "~/components/Input";
import AppLogoField from "~/components/Settings/AppLogoField";
import { toast } from "~/lib/toast";
import { saveAppDetails } from "~/server/actions/oauthApps";
import { forgetApproval } from "~/server/actions/oauthStatus";
import type { TestAccount } from "~/server/actions/testAccounts";
import type { OAuthClientSummary } from "~/server/loaders/console";
import { Button } from "~/ui/button";
import Badge from "~/ui/badge";
import Callout from "~/ui/callout";
import ConfirmDestructiveAction from "~/ui/confirm-destructive-action";
import {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetSection,
  SheetTitle,
} from "~/ui/sheet";

export const MAX_REDIRECT_URIS = 5;

interface Props {
  client: OAuthClientSummary | null;
  /** The signed-in member's test accounts, each with a Forget approval button. */
  testAccounts: TestAccount[];
  dispatch: (formData: FormData) => void;
  isPending: boolean;
  /** The secret just minted or rolled for this client, or null. Shown once. */
  secret: string | null;
  onClose: () => void;
  /**
   * An officer editing a DevDogs app from Console → Apps: no owner, so no test
   * accounts, and the details help speaks of the app rather than "your app".
   */
  devDogsApp?: boolean;
}

/**
 * The right-hand drawer where one OAuth client is edited (settings-oauth.html).
 * Redirect URIs, regenerate and revoke are immediate server actions, each of
 * the destructive ones behind a named confirm. A fresh secret is shown once and
 * the drawer cannot be dismissed until the member presses Done.
 */
export default function OAuthClientSheet({
  client,
  testAccounts,
  dispatch,
  isPending,
  secret,
  onClose,
  devDogsApp = false,
}: Props) {
  // The secret the member has already acknowledged, so Done hides it for good.
  const [acknowledged, setAcknowledged] = useState<string | null>(null);
  const revealed = secret !== null && secret !== acknowledged ? secret : null;
  const published = client?.status === "in_production";
  // Q178: a member's published app keeps its branding until an officer returns
  // it to Testing. An officer editing a DevDogs app is not locked out.
  const brandingLocked = published && !devDogsApp;

  return (
    <Sheet
      open={client !== null}
      onOpenChange={(open) => {
        if (!open && revealed === null) onClose();
      }}
    >
      <SheetContent
        showCloseButton={revealed === null}
        onEscapeKeyDown={(e) => revealed !== null && e.preventDefault()}
        onInteractOutside={(e) => revealed !== null && e.preventDefault()}
        aria-label="Edit OAuth client"
      >
        {client && (
          <>
            <SheetHeader>
              <div>
                <SheetTitle>Edit OAuth client</SheetTitle>
                <SheetDescription asChild>
                  <div
                    className="row"
                    style={{ gap: 10, marginTop: 10, flexWrap: "wrap" }}
                  >
                    <span className="small muted">{client.label}</span>
                    <Badge variant={published ? "warning" : "info"}>
                      {published ? "In production" : "Testing"}
                    </Badge>
                  </div>
                </SheetDescription>
              </div>
            </SheetHeader>

            <SheetBody>
              <div className="field">
                <span className="label">Client name</span>
                <Input value={client.label} readOnly aria-label="Client name" />
              </div>

              <div className="field">
                <label className="label" htmlFor="oauth-sheet-cid">
                  Client ID
                </label>
                <Input id="oauth-sheet-cid" mono copy value={client.clientId} />
                <span className="help">
                  Read-only. Safe to put in your project&rsquo;s environment
                  variables.
                </span>
              </div>

              {revealed !== null ? (
                <div className="field">
                  <label className="label" htmlFor="oauth-sheet-secret">
                    New client secret
                  </label>
                  <Input id="oauth-sheet-secret" mono copy value={revealed} />
                  <Callout
                    tone="warning"
                    alert
                    title="You won't see this again."
                  >
                    Copy it now. The close button is off until you press Done.
                  </Callout>
                </div>
              ) : (
                <div className="field">
                  <span className="label">Client secret</span>
                  <p className="small muted" style={{ margin: 0 }}>
                    Hidden. Secrets can&rsquo;t be read after they&rsquo;re
                    generated. To get a new one, use Regenerate under Danger
                    zone below.
                  </p>
                </div>
              )}

              <SheetSection>Access</SheetSection>
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
                      <form action={dispatch} className="contents">
                        <input type="hidden" name="intent" value="remove-uri" />
                        <input
                          type="hidden"
                          name="clientId"
                          value={client.clientId}
                        />
                        <input type="hidden" name="uri" value={uri} />
                        <button
                          type="submit"
                          className="iconbtn"
                          aria-label={`Remove ${uri}`}
                          disabled={
                            isPending || client.redirectUris.length <= 1
                          }
                        >
                          <TrashIcon aria-hidden />
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
                {client.redirectUris.length < MAX_REDIRECT_URIS && (
                  <form action={dispatch} className="set-uri">
                    <input type="hidden" name="intent" value="add-uri" />
                    <input
                      type="hidden"
                      name="clientId"
                      value={client.clientId}
                    />
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
                <span className="help">{REDIRECT_RULE_HELP} At least one.</span>
              </div>

              <SheetSection>App details</SheetSection>
              <p className="help" style={{ margin: "0 0 12px" }}>
                {devDogsApp
                  ? "Shown on the consent screen. The app can be published only once it has a logo, a homepage and a privacy policy."
                  : "Shown on the consent screen. All three are optional while your app is in Testing, but an officer can publish it only once it has a logo, a homepage and a privacy policy."}
              </p>
              {brandingLocked ? (
                <LockedBranding client={client} />
              ) : (
                <>
                  <AppLogoField
                    clientId={client.clientId}
                    label={client.label}
                    logoUrl={client.logoUrl}
                  />
                  <AppLinksForm client={client} />
                </>
              )}

              {!devDogsApp && (
                <>
                  <SheetSection>Test accounts</SheetSection>
                  <TestAccountApprovals
                    client={client}
                    testAccounts={testAccounts}
                  />
                </>
              )}

              <SheetSection>
                <span style={{ color: "var(--bad)" }}>Danger zone</span>
              </SheetSection>
              <p className="help" style={{ margin: "0 0 12px" }}>
                These act right away, after you confirm. Close doesn&rsquo;t
                undo them.
              </p>
              <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                <ConfirmDestructiveAction
                  action={dispatch}
                  title={`Regenerate secret for ${client.label}?`}
                  description={
                    published
                      ? "The current secret stops working immediately. Members cannot sign in to that app until it has the new secret. The new secret is shown once."
                      : "The current secret stops working immediately. Any project still using it can't sign members in until you paste the new one. The new secret is shown once."
                  }
                  submitLabel="Regenerate secret"
                >
                  <input type="hidden" name="intent" value="reset-secret" />
                  <input
                    type="hidden"
                    name="clientId"
                    value={client.clientId}
                  />
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
                  action={dispatch}
                  title="Delete OAuth app"
                  description={`Deleting "${client.label}" removes its client ID and secret and signs out every other member who approved it. Your own sessions and test accounts are not signed out by this. Any project using the credentials loses access immediately.`}
                  submitLabel="Delete app"
                >
                  <input type="hidden" name="intent" value="revoke-client" />
                  <input
                    type="hidden"
                    name="clientId"
                    value={client.clientId}
                  />
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
            </SheetBody>

            <SheetFooter>
              {revealed !== null ? (
                <Button type="button" onClick={() => setAcknowledged(revealed)}>
                  <CheckIcon aria-hidden />
                  Done
                </Button>
              ) : (
                <SheetClose asChild>
                  <Button type="button" variant="ghost">
                    Close
                  </Button>
                </SheetClose>
              )}
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** The redirect rule, in the words the form and the help use. */
export const REDIRECT_RULE_HELP =
  "http only on localhost, 127.0.0.1 and [::1]; https everywhere else.";

function formText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
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

/** The homepage and privacy policy, saved together. */
function AppLinksForm({ client }: { client: OAuthClientSummary }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function save(formData: FormData) {
    setPending(true);
    try {
      const result = await saveAppDetails(client.clientId, {
        homepageUrl: formText(formData, "homepageUrl"),
        privacyPolicyUrl: formText(formData, "privacyPolicyUrl"),
      });
      if (result.ok) {
        toast.success("App details saved");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("Failed to save the app details");
    } finally {
      setPending(false);
    }
  }

  return (
    <form action={save} className="contents">
      <label className="field">
        <span className="label">Homepage</span>
        <Input
          mono
          name="homepageUrl"
          type="url"
          defaultValue={client.homepageUrl ?? ""}
          placeholder="https://my-app.example.com"
        />
      </label>
      <label className="field">
        <span className="label">Privacy policy</span>
        <Input
          mono
          name="privacyPolicyUrl"
          type="url"
          defaultValue={client.privacyPolicyUrl ?? ""}
          placeholder="https://my-app.example.com/privacy"
        />
        <span className="help">https addresses only.</span>
      </label>
      <div>
        <FormButton theme="black" type="submit" size="sm" disabled={pending}>
          Save details
        </FormButton>
      </div>
    </form>
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
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function forget(account: TestAccount) {
    setPendingId(account.userId);
    try {
      await forgetApproval(client.clientId, account.userId);
      toast.success(`Forgot ${account.displayName}'s approval`);
      router.refresh();
    } catch {
      toast.error("Failed to forget the approval");
    } finally {
      setPendingId(null);
    }
  }

  if (testAccounts.length === 0) {
    return (
      <p className="help" style={{ margin: 0 }}>
        You have no test accounts yet. Add one under Test accounts on this page.
      </p>
    );
  }

  return (
    <div className="set-rows" role="list">
      {testAccounts.map((account) => {
        const approved = client.approvedTestAccountIds.includes(account.userId);
        return (
          <div role="listitem" key={account.userId} className="arow">
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
                disabled={!approved || pendingId === account.userId}
                aria-label={`Forget approval for ${account.displayName}`}
                onClick={() => void forget(account)}
              >
                Forget approval
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
