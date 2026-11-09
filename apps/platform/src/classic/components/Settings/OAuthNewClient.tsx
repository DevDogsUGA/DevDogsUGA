"use client";

import Link from "next/link";
import { CheckIcon, PlusIcon } from "@phosphor-icons/react/ssr";
import FormButton from "~/classic/components/FormButton";
import Input from "~/classic/components/Input";
import { REDIRECT_RULE_HELP } from "~/classic/components/Settings/redirectUris";
import { createOAuthClient } from "~/server/actions/oauth";
import { buttonVariants } from "~/classic/ui/button";
import Callout from "~/classic/ui/callout";
import { ConsoleCard } from "~/classic/ui/card";
import Field from "~/classic/ui/field";
import { CommandFeedback, useCommand } from "~/classic/ui/use-command";

/**
 * The two steps of making an app (settings-oauth-new.html):
 * describe it, then copy its secret. Step 2 replaces step 1 in place once the
 * server answers, because the secret exists only in that one response.
 */
export default function OAuthNewClient({
  issuer,
  defaultRedirectUris,
}: {
  issuer: string | null;
  /** The redirect URIs a new client starts with (the server's, not typed here). */
  defaultRedirectUris: string[];
}) {
  // No refresh on success: the page would re-count the member's apps, and at
  // the cap it swaps this form for a notice, taking the one-time secret with it.
  const {
    run,
    pending: isPending,
    result,
  } = useCommand(createOAuthClient, { refresh: false });
  const created = result?.ok ? result.data : undefined;

  if (created) {
    const { clientId, clientSecret } = created;
    return (
      <ConsoleCard.Root id="step-2">
        <ConsoleCard.Header
          title="Copy your client secret"
          description="Step 2 of 2"
        />
        <ConsoleCard.Content>
          <Callout
            tone="warning"
            alert
            title="You won't see this secret again."
          >
            Copy it now and keep this tab open until it&rsquo;s in your project.
            If you lose it, regenerate it from the app&rsquo;s page.
          </Callout>
          <Field id="new-client-id" label="Client ID" htmlFor="new-cid">
            <Input
              id="new-cid"
              mono
              copy
              className="max-w-sm"
              value={clientId}
            />
          </Field>
          <Field
            id="new-client-secret"
            label="Client secret"
            htmlFor="new-secret"
          >
            <Input
              id="new-secret"
              mono
              copy
              className="max-w-sm"
              value={clientSecret}
            />
          </Field>
          {issuer && (
            <Field
              id="new-client-issuer"
              label="Issuer for your provider"
              htmlFor="new-issuer"
            >
              <Input
                id="new-issuer"
                mono
                copy
                className="max-w-sm"
                value={issuer}
              />
            </Field>
          )}
          <div>
            <Link
              href="/dashboard/oauth"
              className={buttonVariants({ size: "lg" })}
            >
              <CheckIcon aria-hidden />
              Done
            </Link>
          </div>
        </ConsoleCard.Content>
      </ConsoleCard.Root>
    );
  }

  return (
    <ConsoleCard.Root id="step-1">
      <ConsoleCard.Header title="Create the app" description="Step 1 of 2" />
      <form action={run}>
        <ConsoleCard.Content>
          <Field
            id="new-client-name"
            label="App name"
            htmlFor="new-client-label"
            description="Shown to you here and on the sign-in screen."
          >
            <Input
              id="new-client-label"
              name="label"
              className="max-w-sm"
              placeholder="my-project"
              required
              maxLength={100}
            />
          </Field>
          <Field
            id="new-client-redirects"
            label="Redirect URIs"
            description={`${REDIRECT_RULE_HELP} A new app starts with the one below; add more from its page.`}
          >
            <ul className="flex flex-col gap-2">
              {defaultRedirectUris.map((uri) => (
                <li key={uri}>
                  <Input
                    mono
                    className="max-w-sm"
                    value={uri}
                    readOnly
                    aria-label={uri}
                  />
                </li>
              ))}
            </ul>
          </Field>
          <Field
            id="new-client-status"
            label="Status"
            description="Every new app starts in Testing: only you and your test accounts can sign in. An officer publishes it once it has a logo, a homepage and a privacy policy."
          >
            <Input
              className="max-w-sm"
              value="Testing"
              disabled
              readOnly
              aria-label="Status"
            />
          </Field>
          <div className="flex items-center gap-4">
            <FormButton theme="cyan" type="submit" disabled={isPending}>
              <PlusIcon aria-hidden />
              Create app
            </FormButton>
            <Link
              href="/dashboard/oauth"
              className="rounded-xs text-sm text-mauve-300 underline underline-offset-4 outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-white"
            >
              Cancel
            </Link>
          </div>
          <CommandFeedback result={result} />
        </ConsoleCard.Content>
      </form>
    </ConsoleCard.Root>
  );
}
