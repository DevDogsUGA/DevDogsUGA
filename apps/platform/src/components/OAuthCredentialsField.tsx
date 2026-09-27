"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "~/ui/alert-dialog";
import { usePathname, useRouter } from "next/navigation";
import {
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowUpIcon,
  ArrowClockwiseIcon,
  PlusIcon,
  XIcon,
} from "@phosphor-icons/react/ssr";
import oauthAction from "~/server/actions/oauth";
import type { getOAuthPageData } from "~/server/loaders/console";
import ConfirmDestructiveAction from "~/ui/confirm-destructive-action";
import FormButton from "~/components/FormButton";
import Input from "~/components/Input";

const MAX_REDIRECT_URIS = 5;

type OAuthData = Awaited<ReturnType<typeof getOAuthPageData>>;

export default function OAuthCredentialsField({
  clients,
  hasGithub,
  prefillRedirectUri,
}: OAuthData & { prefillRedirectUri?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [{ clientId: mintedClientId, clientSecret }, dispatch, isPending] =
    useActionState(oauthAction, { clientId: null, clientSecret: null });

  const prevIsPendingRef = useRef(false);
  useEffect(() => {
    if (prevIsPendingRef.current && !isPending) router.refresh();
    prevIsPendingRef.current = isPending;
  }, [isPending, router]);

  const [prefillOpen, setPrefillOpen] = useState(false);

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

  const handlePrefillConfirm = useCallback(() => {
    if (!prefillRedirectUri || !soleClient) return;
    const fd = new FormData();
    fd.set("intent", "add-uri");
    fd.set("clientId", soleClient.clientId);
    fd.set("uri", prefillRedirectUri);
    dispatch(fd);
    setPrefillOpen(false);
  }, [prefillRedirectUri, soleClient, dispatch]);

  function handlePrefillOpenChange(open: boolean) {
    setPrefillOpen(open);
    if (!open) router.replace(pathname, { scroll: false });
  }

  return (
    <>
      <AlertDialog open={prefillOpen} onOpenChange={handlePrefillOpenChange}>
        <AlertDialogContent>
          <div className="flex flex-col gap-6 rounded-xl border border-mauve-700 bg-mauve-900 px-4 py-6 text-mauve-300 shadow-xl shadow-black/40">
            {prefillStatus === "no-client" && (
              <>
                <AlertDialogTitle className="text-lg font-semibold text-white">
                  No OAuth client yet
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Create an OAuth client first, then revisit this page to
                  register your redirect URI.
                </AlertDialogDescription>
                <div className="flex justify-end">
                  <AlertDialogCancel className="rounded-sm border border-mauve-600 bg-mauve-800 px-4 py-1 text-white transition-colors outline-none hover:border-white focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-mauve-900">
                    Got it
                  </AlertDialogCancel>
                </div>
              </>
            )}

            {prefillStatus === "multiple-clients" && (
              <>
                <AlertDialogTitle className="text-lg font-semibold text-white">
                  Pick a client
                </AlertDialogTitle>
                <AlertDialogDescription>
                  You have more than one OAuth client. Add{" "}
                  <Input.Text>{prefillRedirectUri}</Input.Text> as a redirect
                  URI on the right one below.
                </AlertDialogDescription>
                <div className="flex justify-end">
                  <AlertDialogCancel className="rounded-sm border border-mauve-600 bg-mauve-800 px-4 py-1 text-white transition-colors outline-none hover:border-white focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-mauve-900">
                    Got it
                  </AlertDialogCancel>
                </div>
              </>
            )}

            {prefillStatus === "already-added" && (
              <>
                <AlertDialogTitle className="text-lg font-semibold text-white">
                  Already registered
                </AlertDialogTitle>
                <AlertDialogDescription>
                  <Input.Text>{prefillRedirectUri}</Input.Text> is already in
                  your redirect URIs. You&rsquo;re all set.
                </AlertDialogDescription>
                <div className="flex justify-end">
                  <AlertDialogCancel className="rounded-sm border border-mauve-600 bg-mauve-800 px-4 py-1 text-white transition-colors outline-none hover:border-white focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-mauve-900">
                    Close
                  </AlertDialogCancel>
                </div>
              </>
            )}

            {prefillStatus === "at-limit" && (
              <>
                <AlertDialogTitle className="text-lg font-semibold text-white">
                  Redirect URI limit reached
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This client already has {MAX_REDIRECT_URIS} redirect URIs.
                  Remove one before adding{" "}
                  <Input.Text>{prefillRedirectUri}</Input.Text>.
                </AlertDialogDescription>
                <div className="flex justify-end">
                  <AlertDialogCancel className="rounded-sm border border-mauve-600 bg-mauve-800 px-4 py-1 text-white transition-colors outline-none hover:border-white focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-mauve-900">
                    Got it
                  </AlertDialogCancel>
                </div>
              </>
            )}

            {prefillStatus === "ready" && (
              <>
                <AlertDialogTitle className="text-lg font-semibold text-white">
                  Register redirect URI?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Add <Input.Text>{prefillRedirectUri}</Input.Text> as a
                  redirect URI for your DevDogs OAuth client?
                </AlertDialogDescription>
                <div className="flex items-center justify-end gap-4">
                  <AlertDialogCancel className="rounded-sm border border-mauve-600 bg-mauve-800 px-4 py-1 text-white transition-colors outline-none hover:border-white focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-mauve-900">
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction asChild>
                    <button
                      className="rounded-sm border-2 border-cyan-400 bg-cyan-400 px-4 py-1 font-medium text-black transition outline-none hover:bg-cyan-950 hover:text-cyan-400 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2"
                      onClick={handlePrefillConfirm}
                      disabled={isPending}
                    >
                      Add
                    </button>
                  </AlertDialogAction>
                </div>
              </>
            )}
          </div>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex flex-col gap-6">
        {clients.length === 0 && (
          <p className="text-sm text-mauve-400">
            No OAuth clients yet. Run <Input.Text>devtools oauth</Input.Text>{" "}
            from your project, or create one below.
          </p>
        )}

        {clients.map((client) => {
          const clientAtUriLimit =
            client.redirectUris.length >= MAX_REDIRECT_URIS;
          const revealedSecret =
            mintedClientId === client.clientId ? clientSecret : null;

          return (
            <div
              key={client.clientId}
              className="flex flex-col gap-3 rounded-lg border border-mauve-800 p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-white">{client.label}</span>
                <ConfirmDestructiveAction
                  action={dispatch}
                  title="Revoke OAuth Client"
                  description={`Revoking "${client.label}" deletes its client ID and secret. Any project using them loses access immediately.`}
                  userConfirmText="Revoke Client"
                  submitLabel="Revoke"
                >
                  <input type="hidden" name="intent" value="revoke-client" />
                  <input
                    type="hidden"
                    name="clientId"
                    value={client.clientId}
                  />
                  <FormButton
                    theme="rose"
                    type="submit"
                    disabled={isPending}
                    className="text-sm"
                  >
                    Revoke
                  </FormButton>
                </ConfirmDestructiveAction>
              </div>

              <Input mono copy className="max-w-sm" value={client.clientId} />

              <div className="flex w-full max-w-sm flex-col items-start gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="font-medium text-white">Client Secret</span>
                  <p className="pb-1.5 text-xs text-balance text-mauve-400 sm:text-left">
                    Client secrets cannot be accessed after they are generated:
                    store them safely in your project&rsquo;s{" "}
                    <Input.Text>.env</Input.Text> file!
                  </p>
                  <Input
                    mono
                    copy
                    value={revealedSecret ?? "•••••••••••••••••"}
                    disabled={revealedSecret === null}
                  />
                </label>

                <form action={dispatch}>
                  <input type="hidden" name="intent" value="reset-secret" />
                  <input
                    type="hidden"
                    name="clientId"
                    value={client.clientId}
                  />
                  <FormButton
                    theme="black"
                    className="self-end text-sm font-medium"
                    disabled={isPending}
                    type="submit"
                  >
                    <ArrowClockwiseIcon /> Reset Client Secret
                  </FormButton>
                </form>
              </div>

              <div className="flex flex-col gap-1.5 pb-1">
                <h4 className="font-medium text-white">Redirect URIs</h4>
                <p className="max-w-prose pb-1.5 text-xs text-balance text-mauve-400 sm:text-left">
                  Up to {MAX_REDIRECT_URIS} redirect URIs. OAuth clients are for
                  local testing only -- only <Input.Text>localhost</Input.Text>{" "}
                  addresses are accepted.
                </p>

                <ul className="flex flex-col gap-3 pb-1.5 empty:hidden">
                  {client.redirectUris.map((uri) => (
                    <li key={uri} className="flex items-center gap-1.5 text-sm">
                      <form action={dispatch}>
                        <input type="hidden" name="intent" value="remove-uri" />
                        <input
                          type="hidden"
                          name="clientId"
                          value={client.clientId}
                        />
                        <input type="hidden" name="uri" value={uri} />
                        <button
                          className="rounded-sm p-1.25 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                          type="submit"
                          aria-label={`Remove ${uri}`}
                        >
                          <XIcon />
                        </button>
                      </form>
                      <Input.Text>{uri}</Input.Text>
                    </li>
                  ))}
                </ul>

                {!clientAtUriLimit && (
                  <form action={dispatch} className="flex max-w-sm gap-1.5">
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
                      placeholder="https://example.com/callback"
                      required
                    />
                    <FormButton
                      theme="black"
                      type="submit"
                      className="text-sm text-nowrap"
                    >
                      <ArrowUpIcon />
                      Add
                    </FormButton>
                  </form>
                )}
              </div>
            </div>
          );
        })}

        {hasGithub && (
          <form action={dispatch} className="flex max-w-sm items-end gap-1.5">
            <input type="hidden" name="intent" value="create-client" />
            <label className="flex flex-1 flex-col gap-1.5 text-sm text-white">
              New client label
              <Input
                mono
                name="label"
                placeholder="my-project"
                required
                maxLength={100}
              />
            </label>
            <FormButton
              theme="cyan"
              type="submit"
              disabled={isPending}
              className="text-sm text-nowrap"
            >
              <PlusIcon /> Create
            </FormButton>
          </form>
        )}
      </div>
    </>
  );
}
