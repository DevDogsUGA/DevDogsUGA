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
import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpIcon, ArrowClockwiseIcon, XIcon } from "@phosphor-icons/react/ssr";
import oauthAction from "~/server/actions/oauth";
import type { getOAuthPageData } from "~/server/loaders/console";
import ConfirmDestructiveAction from "~/ui/confirm-destructive-action";
import FormButton from "~/components/FormButton";
import Input from "~/components/Input";
import Toggle from "~/ui/switch";

type OAuthData = Awaited<ReturnType<typeof getOAuthPageData>>;

export default function OAuthCredentialsField({
  clientId: initialClientId,
  redirectUris: initialRedirectUris,
  hasGithub,
  prefillRedirectUri,
}: OAuthData & { prefillRedirectUri?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [{ clientId, clientSecret, redirectUris }, dispatch, isPending] =
    useActionState(oauthAction, {
      clientId: initialClientId,
      clientSecret: null,
      redirectUris: initialRedirectUris,
      reportApiKey: null,
      webhookSecret: null,
      reportWebhookUrl: null,
    });

  const prevIsPendingRef = useRef(false);
  useEffect(() => {
    if (prevIsPendingRef.current && !isPending) router.refresh();
    prevIsPendingRef.current = isPending;
  }, [isPending, router]);

  const oauthEnabled = clientId !== null;
  const atUriLimit = redirectUris.length >= 5;

  const [prefillOpen, setPrefillOpen] = useState(false);

  useEffect(() => {
    if (prefillRedirectUri) setPrefillOpen(true);
  }, [prefillRedirectUri]);

  const prefillStatus = !prefillRedirectUri
    ? null
    : !oauthEnabled
      ? "no-client"
      : redirectUris.includes(prefillRedirectUri)
        ? "already-added"
        : atUriLimit
          ? "at-limit"
          : "ready";

  const handlePrefillConfirm = useCallback(() => {
    if (!prefillRedirectUri) return;
    const fd = new FormData();
    fd.set("intent", "add-uri");
    fd.set("uri", prefillRedirectUri);
    dispatch(fd);
    setPrefillOpen(false);
  }, [prefillRedirectUri, dispatch]);

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
                    OAuth not enabled
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Enable your OAuth client first, then revisit this page to
                    register your redirect URI.
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
                    <Input.Text>{prefillRedirectUri}</Input.Text>{" "}
                    is already in your redirect URIs. You&rsquo;re all set.
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
                    You&rsquo;ve already registered 5 redirect URIs. Remove one
                    before adding{" "}
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
                    Add{" "}
                    <Input.Text>{prefillRedirectUri}</Input.Text>{" "}
                    as a redirect URI for your DevDogs OAuth client?
                  </AlertDialogDescription>
                  <div className="flex items-center justify-end gap-4">
                    <AlertDialogCancel className="rounded-sm border border-mauve-600 bg-mauve-800 px-4 py-1 text-white transition-colors outline-none hover:border-white focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-mauve-900">
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction asChild>
                      <button
                        className="rounded-sm border-2 border-cyan-400 bg-cyan-400 px-4 py-1 font-medium text-black transition hover:bg-cyan-950 hover:text-cyan-400 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 outline-none"
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

      <div className="flex flex-col gap-3">
        {oauthEnabled ? (
          <ConfirmDestructiveAction
            action={dispatch}
            title="Disable OAuth"
            description="Disabling OAuth will delete your client ID and secret. Any projects using them will lose access immediately."
            userConfirmText="Delete OAuth Client"
            submitLabel="Disable"
          >
            <input type="hidden" name="intent" value="toggle-client" />
            <div className="flex items-center gap-3 self-start text-sm text-white">
              <label className="contents">
                <Toggle checked={oauthEnabled} pending={isPending} />
                Enable OAuth
              </label>
              <span className="text-mauve-400">(Currently Active)</span>
            </div>
          </ConfirmDestructiveAction>
        ) : (
          <form
            action={dispatch}
            className="flex items-center gap-3 self-start text-sm text-white"
          >
            <input type="hidden" name="intent" value="toggle-client" />
            <label className="contents">
              <Toggle
                checked={oauthEnabled}
                pending={isPending}
                disabled={!hasGithub}
              />
              Enable OAuth
            </label>
            <span className="text-mauve-400">(Currently Inactive)</span>
          </form>
        )}

        <Input
          mono
          copy
          className="max-w-sm"
          value={clientId ?? "•••••••••••••••••"}
          disabled={!oauthEnabled}
        />

        <div className="mt-4 flex w-full max-w-sm flex-col items-start gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="font-medium text-white">Client Secret</span>
            <p className="pb-1.5 text-xs text-balance text-mauve-400 sm:text-left">
              Client secrets cannot be accessed after they are generated: store
              them safely in your project&rsquo;s <Input.Text>.env</Input.Text>{" "}
              file!
            </p>
            <Input
              mono
              copy
              value={clientSecret ?? "•••••••••••••••••"}
              disabled={clientSecret === null}
            />
          </label>

          <ConfirmDestructiveAction
            action={dispatch}
            title="Reset Client Secret"
            description="Generating a new client secret invalidates your existing secret. This means you won't be able to continue using your existing secret in your projects."
            userConfirmText="Reset Client Secret"
            submitLabel="Reset"
          >
            <input type="hidden" name="intent" value="reset-secret" />
            <FormButton
              theme="rose"
              className="self-end text-sm font-medium"
              disabled={isPending}
              type="submit"
            >
              <ArrowClockwiseIcon /> Reset Client Secret
            </FormButton>
          </ConfirmDestructiveAction>
        </div>

        <div className="mt-4 flex flex-col gap-1.5 pb-1">
          <h4 className="font-medium text-white">Redirect URIs</h4>
          <p className="max-w-prose pb-1.5 text-xs text-balance text-mauve-400 sm:text-left">
            Up to 5 redirect URIs. OAuth clients are for local testing only — only{" "}
            <Input.Text>localhost</Input.Text> addresses are accepted.
          </p>

          <ul className="flex flex-col gap-3 pb-1.5 empty:hidden">
            {redirectUris.map((uri) => (
              <li key={uri} className="flex items-center gap-1.5 text-sm">
                <form action={dispatch}>
                  <input type="hidden" name="intent" value="remove-uri" />
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

          {!atUriLimit && (
            <form action={dispatch} className="flex max-w-sm gap-1.5">
              <input type="hidden" name="intent" value="add-uri" />
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
    </>
  );
}
