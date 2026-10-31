"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/ui/alert-dialog";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { PlusIcon } from "@phosphor-icons/react/ssr";
import { addRedirectUri } from "~/server/actions/oauth";
import type { getOAuthPageData } from "~/server/loaders/console";
import Input from "~/components/Input";
import { MAX_REDIRECT_URIS } from "~/components/Settings/redirectUris";
import OAuthClientTable from "~/components/Settings/OAuthClientTable";
import { Button } from "~/ui/button";
import EmptyState from "~/ui/empty-state";
import { CommandFeedback, useCommand } from "~/ui/use-command";

type OAuthData = Awaited<ReturnType<typeof getOAuthPageData>>;

export default function OAuthCredentialsField({
  clients,
  hasGithub,
  appCount,
  maxApps,
  prefillRedirectUri,
}: OAuthData & { prefillRedirectUri?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [prefillOpen, setPrefillOpen] = useState(false);

  function handlePrefillOpenChange(open: boolean) {
    setPrefillOpen(open);
    if (!open) router.replace(pathname, { scroll: false });
  }

  // Only the prefill confirm adds a URI from this list; an app's own page holds
  // every other change. The dialog stays open until it works, so a refusal
  // shows where the member is looking.
  const {
    run: addPrefill,
    pending: isPending,
    result: prefillResult,
  } = useCommand(async (clientId: string, uri: string) => {
    const result = await addRedirectUri(clientId, uri);
    if (result.ok) handlePrefillOpenChange(false);
    return result;
  });

  useEffect(() => {
    // Intentional: open the prefill UI when a redirect URI arrives via props.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (prefillRedirectUri) setPrefillOpen(true);
  }, [prefillRedirectUri]);

  // The prefill link (from `devtools oauth`'s legacy manual flow) names a
  // redirect URI but no client -- fine when there is exactly one client to
  // guess, which is the common case right after the gate mints the first
  // one. With several, there is nothing to disambiguate against, so the
  // dialog says so instead of picking one.
  const soleClient = clients.length === 1 ? clients[0] : null;
  const atUriLimit =
    (soleClient?.redirectUris.length ?? 0) >= MAX_REDIRECT_URIS;

  const prefillStatus = !prefillRedirectUri
    ? null
    : clients.length === 0
      ? "no-client"
      : !soleClient
        ? "multiple-clients"
        : soleClient.redirectUris.includes(prefillRedirectUri)
          ? "already-added"
          : atUriLimit
            ? "at-limit"
            : "ready";

  function handlePrefillConfirm() {
    if (!prefillRedirectUri || !soleClient) return;
    addPrefill(soleClient.clientId, prefillRedirectUri);
  }

  const prefill = (title: string, body: ReactNode, confirm?: ReactNode) => (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{body}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        {confirm ?? <AlertDialogCancel>Got it</AlertDialogCancel>}
      </AlertDialogFooter>
    </>
  );

  return (
    <>
      <AlertDialog open={prefillOpen} onOpenChange={handlePrefillOpenChange}>
        <AlertDialogContent>
          {prefillStatus === "no-client" &&
            prefill(
              "No OAuth client yet",
              "Create an OAuth client first, then revisit this page to register your redirect URI.",
            )}
          {prefillStatus === "multiple-clients" &&
            prefill(
              "Pick a client",
              <>
                You have more than one OAuth client. Add{" "}
                <Input.Text>{prefillRedirectUri}</Input.Text> as a redirect URI
                on the right one below.
              </>,
            )}
          {prefillStatus === "already-added" &&
            prefill(
              "Already registered",
              <>
                <Input.Text>{prefillRedirectUri}</Input.Text> is already in your
                redirect URIs. You&rsquo;re all set.
              </>,
            )}
          {prefillStatus === "at-limit" &&
            prefill(
              "Redirect URI limit reached",
              <>
                This client already has {MAX_REDIRECT_URIS} redirect URIs.
                Remove one before adding{" "}
                <Input.Text>{prefillRedirectUri}</Input.Text>.
              </>,
            )}
          {prefillStatus === "ready" &&
            prefill(
              "Register redirect URI?",
              <>
                Add <Input.Text>{prefillRedirectUri}</Input.Text> as a redirect
                URI for your DevDogs OAuth client?
              </>,
              <>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(event) => {
                    // Closing waits for the add to work.
                    event.preventDefault();
                    handlePrefillConfirm();
                  }}
                  disabled={isPending}
                >
                  Add
                </AlertDialogAction>
              </>,
            )}
          {prefillStatus === "ready" && (
            <CommandFeedback result={prefillResult} />
          )}
        </AlertDialogContent>
      </AlertDialog>

      <div className="row" style={{ gap: 12, marginBottom: 16 }}>
        <NewAppButton
          hasGithub={hasGithub}
          appCount={appCount}
          maxApps={maxApps}
        />
        <span className="small muted">
          {appCount} of {maxApps} apps
        </span>
      </div>

      {clients.length === 0 ? (
        <EmptyState
          image={false}
          title="No apps yet"
          description={
            hasGithub
              ? "Create one to get a client ID and secret for testing DevDogs sign-in. Every new app starts in Testing."
              : "Apps need a linked GitHub account. Link one, then come back here."
          }
        />
      ) : (
        <OAuthClientTable clients={clients} />
      )}
    </>
  );
}

/**
 * The create button. It turns into a disabled button with the reason when the
 * member already owns the most apps they may (three, Testing or In production),
 * or has no GitHub account linked yet.
 */
export function NewAppButton({
  hasGithub,
  appCount,
  maxApps,
}: {
  hasGithub: boolean;
  appCount: number;
  maxApps: number;
}) {
  if (appCount >= maxApps) {
    return (
      <>
        <Button
          type="button"
          variant="outline"
          disabled
          aria-describedby="new-app-reason"
        >
          <PlusIcon aria-hidden />
          New OAuth app
        </Button>
        <span id="new-app-reason" className="small muted">
          You own {maxApps} apps, the most a member can. Delete one to create
          another.
        </span>
      </>
    );
  }
  if (!hasGithub) {
    return (
      <Link href="/dashboard/accounts#github" className="btn secondary">
        Link GitHub account
      </Link>
    );
  }
  return (
    <Link href="/dashboard/oauth/new" className="btn secondary">
      <PlusIcon aria-hidden />
      New OAuth app
    </Link>
  );
}
