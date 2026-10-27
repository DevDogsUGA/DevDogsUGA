"use client";

import Link from "next/link";
import { useActionState } from "react";
import { CheckIcon, LockIcon, PlusIcon } from "@phosphor-icons/react/ssr";
import FormButton from "~/components/FormButton";
import Input from "~/components/Input";
import { REDIRECT_RULE_HELP } from "~/components/Settings/OAuthClientSheet";
import oauthAction from "~/server/actions/oauth";
import { buttonVariants } from "~/ui/button";
import Callout from "~/ui/callout";
import { Panel } from "~/ui/app-shell";

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
  const [{ clientId, clientSecret }, dispatch, isPending] = useActionState(
    oauthAction,
    { clientId: null, clientSecret: null },
  );

  if (clientId && clientSecret) {
    return (
      <Panel id="step-2" title="Copy your client secret">
        <div className="eyebrow" style={{ marginTop: -8, marginBottom: 14 }}>
          Step 2 of 2
        </div>
        <div className="card quiet set-card">
          <Callout
            tone="warning"
            alert
            title="You won't see this secret again."
          >
            Copy it now and keep this tab open until it&rsquo;s in your project.
            If you lose it, regenerate it from the client&rsquo;s edit panel.
          </Callout>
          <div className="field" style={{ marginTop: 20 }}>
            <label className="label" htmlFor="new-cid">
              Client ID
            </label>
            <Input id="new-cid" mono copy value={clientId} />
          </div>
          <div className="field" style={{ marginTop: 16 }}>
            <label className="label" htmlFor="new-secret">
              Client secret
            </label>
            <Input id="new-secret" mono copy value={clientSecret} />
          </div>
          {issuer && (
            <div className="field" style={{ marginTop: 16 }}>
              <label className="label" htmlFor="new-issuer">
                Issuer for your provider
              </label>
              <Input id="new-issuer" mono copy value={issuer} />
            </div>
          )}
          <div style={{ marginTop: 24 }}>
            <Link href="/settings/oauth" className={buttonVariants()}>
              <CheckIcon aria-hidden />
              Done
            </Link>
          </div>
        </div>
      </Panel>
    );
  }

  return (
    <Panel id="step-1" title="Create the app">
      <div className="eyebrow" style={{ marginTop: -8 }}>
        Step 1 of 2
      </div>
      <form action={dispatch}>
        <input type="hidden" name="intent" value="create-client" />
        <div className="fields" style={{ marginTop: 18 }}>
          <label className="field">
            <span className="label">App name</span>
            <Input
              name="label"
              placeholder="my-project"
              required
              maxLength={100}
            />
            <span className="help">
              Shown to you here and on the sign-in screen.
            </span>
          </label>
          <div className="field">
            <span className="label">Redirect URIs</span>
            <ul>
              {defaultRedirectUris.map((uri) => (
                <li key={uri} className="set-uri">
                  <Input mono value={uri} readOnly aria-label={uri} />
                </li>
              ))}
            </ul>
            <span className="help">
              {REDIRECT_RULE_HELP} A new app starts with the one above; add more
              from its edit panel.
            </span>
          </div>
          <div className="field">
            <span className="label">Status</span>
            <span className="input">
              <LockIcon aria-hidden className="shrink-0 text-[var(--text-3)]" />
              <input value="Testing" disabled aria-label="Status" readOnly />
            </span>
            <span className="help">
              Every new app starts in Testing: only you and your test accounts
              can sign in. An officer publishes it once it has a logo, a
              homepage and a privacy policy.
            </span>
          </div>
        </div>
        <div className="row" style={{ marginTop: 28 }}>
          <Link href="/settings/oauth" className="btn ghost">
            Cancel
          </Link>
          <FormButton theme="cyan" type="submit" disabled={isPending}>
            <PlusIcon aria-hidden />
            Create app
          </FormButton>
        </div>
      </form>
    </Panel>
  );
}
