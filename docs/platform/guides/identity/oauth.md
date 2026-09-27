---
name: Sign in with DevDogs
description: The wizard that points a sibling project's Supabase instance at DevDogs Auth as an OIDC provider — prerequisites, what it asks, and what to do once it finishes.
order: 2
section: infrastructure
---

# Sign in with DevDogs

DevDogs Auth doubles as a standards-compliant OAuth 2.1 / OIDC provider, so a sibling project — the Community Resource Forum, say — can let its users log in with their DevDogs account. This page is for whoever is adding that button to a project's own Supabase instance, local or hosted. If you are working on the platform's own GitHub identity instead, that is [The DevDogs GitHub App](/docs/platform/guides/identity/github-app).

Two steps make it work: register an OAuth client (a client id and secret), then add a custom OIDC provider row to your own Supabase instance pointing at DevDogs Auth. `pnpm devtools oauth` is both steps, end to end — it can register the client for you with no trip to the website at all.

## Running it

```bash
pnpm devtools oauth
```

Or pick `oauth` from the `pnpm devtools` menu.

**Step 1 — target.** Which Supabase project this run configures:

- **Local** — the wizard runs `supabase status`, in the directory you ran it from, and detects your running instance itself.
- **A hosted project** — production, staging, or a student's own free-tier project. Give it the project's URL and its **service-role key**, either read from `.env.local`/`.env` in the current directory or typed in when asked. This is how the setup wizard (`pnpm devtools setup`) reaches a hosted project too — it chains into this same command with the target already resolved, so nothing is asked twice.

**Step 2 — connect**, to get a client id and secret. Pick one:

- **One-click connect** (default, recommended) — opens a browser at `/tools/oauth/connect` on devdogsuga.org, where you approve the connection, and registers the client for you. On a machine with no browser to open (SSH, a container, CI), it falls back automatically to a **device-code flow**: it prints a short code and a URL, you approve from any browser (your phone works), and the CLI polls until you do.
- **Paste credentials instead** — the manual path, for when the site is unreachable: visit [devdogsuga.org/tools/oauth](https://devdogsuga.org/tools/oauth) yourself, sign in (link your GitHub account if prompted), enable OAuth, and paste the Client ID and Client Secret it shows you. **The secret is shown only once.**

Either way, credentials are written to `.env.local` in the directory you ran it from, so re-running later is instant.

It then checks whether a `custom:devdogsuga` provider already exists on the target — offering to update it, or to register a second one under a new identifier such as `custom:devdogsuga-staging`, which is how you run against a local instance and a hosted one at once — upserts the provider, and prints a checklist.

## After it finishes

1. **Register your Supabase callback URL**, unless you used one-click connect (which already told the platform yours as part of the connection). Paste credentials needs this by hand, at [devdogsuga.org/tools/oauth](https://devdogsuga.org/tools/oauth) — the wizard prints yours, in the form `<your API URL>/auth/v1/callback`.
2. **Allow your app's own callback** in `supabase/config.toml`:

   ```toml
   [auth]
   additional_redirect_urls = ["http://localhost:<port>/auth/callback"]
   ```

3. **Trigger sign-in:**

   ```typescript
   await supabase.auth.signInWithOAuth({
     provider: "custom:devdogsuga",
     options: { redirectTo: `${origin}/auth/callback` },
   });
   ```

Re-run `pnpm devtools oauth` after `supabase db reset` or `supabase stop --no-backup` on a local target — either wipes the provider row along with the rest of the database.

## What DevDogs Auth asserts

The identity a sibling project receives is ultimately backed by the member's UGA Google sign-in: DevDogs Auth itself only accepts new accounts whose email is on the `uga.edu` domain (see [Identity](/docs/platform/guides/identity)), and a member reaches it by signing in to devdogsuga.org with Google first. There is no separate "sign in with Google" mode a sibling project registers for — it always gets the one DevDogs identity, wherever the member's own credential came from.

<details>
<summary>Why does the wizard work the way it does?</summary>

**The Admin SDK, not SQL.** `auth.custom_oauth_providers` lives in the `auth` schema, which PostgREST does not expose. The correct interface is GoTrue's `/admin/custom-oauth-providers` endpoints, wrapped by `@supabase/supabase-js` as `auth.admin.customProviders.*` — the same API the Supabase dashboard uses.

**A service-role key for a hosted target.** The Admin SDK needs one either way; for `local` the wizard reads it itself from `supabase status -o env` rather than asking, since it is already running on this machine.

**OIDC auto-discovery.** The provider is registered as `provider_type: "oidc"` with only an issuer, `{baseUrl}/auth/v1`. GoTrue fetches `{issuer}/.well-known/openid-configuration` itself, so no authorize, token or userinfo URL is hardcoded anywhere.

**One-click connect, with a device-code fallback.** The one-click flow starts a local loopback listener and opens a browser at the platform's `/tools/oauth/connect`; only a failure to start that listener at all falls back to the device-code flow — every other failure (denial, timeout, a bad exchange) is that flow's own and is reported as-is, never silently rerouted.

**Upsert without an upsert endpoint.** GoTrue has separate create and update endpoints. The wizard calls `getProvider(identifier)` first: a 404 means create, any other error is a real failure and is rethrown, and a hit means update. Re-running it therefore updates credentials in place rather than creating duplicates.

**More than one provider.** Supabase allows several custom providers per project, each with a `custom:`-prefixed identifier — which is what makes running against a local instance and a hosted one simultaneously possible.

</details>
