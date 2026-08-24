---
name: Sign in with DevDogs
description: The wizard that points a sibling project's Supabase instance at DevDogs Auth as an OIDC provider — prerequisites, what it asks, and what to do once it finishes.
order: 2
---

# Sign in with DevDogs

DevDogs Auth doubles as a standards-compliant OAuth 2.1 / OIDC provider, so a sibling project — the Community Resource Forum, say — can let its users log in with their DevDogs account. This page is for whoever is adding that button to a project outside this repository. If you are working on the platform's own GitHub identity instead, that is [The DevDogs GitHub App](/docs/platform/guides/identity/github-app).

Two steps make it work: register an OAuth client on the DevDogs console for a client id and secret, then add a custom OIDC provider row to your own Supabase instance pointing at DevDogs Auth. The second used to be an undocumented SQL operation. `pnpm devtools oauth` is that step, end to end.

## Before you run it

- **Local Supabase running.** `supabase start` in your project directory. The wizard auto-detects credentials with `supabase status -o env`, trying a global Supabase CLI first and falling back to `pnpm exec`.
- **An OAuth client registered.** Visit [devdogsuga.org/tools/oauth](https://devdogsuga.org/tools/oauth), sign in (link your GitHub account if prompted), enable OAuth, and copy the Client ID and Client Secret. **The secret is shown only once.**

## Running it

```bash
pnpm devtools oauth [--base-url <url>]
```

Or pick `oauth` from the `pnpm devtools` menu, under Project setup. It configures the Supabase project in **the directory you run it from**, so run it from your own project's root.

Credentials are read from `process.env` — shell exports, `direnv`, a `.env` your shell loads, anything — and written back to `.env.local` on completion, so later runs are instant.

| Variable              | What it is                                             |
| --------------------- | ------------------------------------------------------ |
| `OAUTH_BASE_URL`      | DevDogs API URL (default `https://api.devdogsuga.org`) |
| `OAUTH_PROVIDER_NAME` | display name on the sign-in button (default `DevDogs`) |
| `OAUTH_CLIENT_ID`     | OAuth client ID                                        |
| `OAUTH_CLIENT_SECRET` | OAuth client secret                                    |

It asks for the DevDogs API URL, then the provider display name, then the credentials (offering saved ones if `.env.local` already has them). It detects your local instance, checks whether a `custom:devdogs` provider already exists — offering to update it, or to register a second one under a new identifier such as `custom:devdogs-staging`, which is how you run against a local DevDogs instance and production at once — then upserts the provider and writes `.env.local`. Finally it offers to open the console with your callback URL prefilled, and prints a checklist.

## After it finishes

1. **Register your Supabase callback URL** at [devdogsuga.org/tools/oauth](https://devdogsuga.org/tools/oauth) — the wizard prints yours, in the form `<your API URL>/auth/v1/callback`. Deployed, that is `https://<your-project>.supabase.co/auth/v1/callback`.
2. **Allow your app's own callback** in `supabase/config.toml`:

   ```toml
   [auth]
   additional_redirect_urls = ["http://localhost:<port>/auth/callback"]
   ```

3. **Trigger sign-in:**

   ```typescript
   await supabase.auth.signInWithOAuth({
     provider: "custom:devdogs",
     options: { redirectTo: `${origin}/auth/callback` },
   });
   ```

<details>
<summary>Why does the wizard work the way it does?</summary>

**The Admin SDK, not SQL.** `auth.custom_oauth_providers` lives in the `auth` schema, which PostgREST does not expose. The correct interface is GoTrue's `/admin/custom-oauth-providers` endpoints, wrapped by `@supabase/supabase-js` as `auth.admin.customProviders.*` — the same API the Supabase dashboard uses.

**`supabase status -o env` for credentials.** The Admin SDK needs a service role key, which is secret and should not be pasted around. Parsing that output with `dotenv.parse()` gives `API_URL` and `SERVICE_ROLE_KEY` directly, and keeps the wizard in step with whatever port the local instance actually started on.

**OIDC auto-discovery.** The provider is registered as `provider_type: "oidc"` with only an issuer, `{baseUrl}/auth/v1`. GoTrue fetches `{issuer}/.well-known/openid-configuration` itself, so no authorize, token or userinfo URL is hardcoded anywhere.

**`process.env`, not a `.env` parser.** Sibling projects store variables differently — shell exports, `.envrc`, Next.js's precedence chain. Tying the wizard to one loading strategy would break the others; reading `process.env` lets callers load however they like. Output still goes to `.env.local`, the conventional gitignored override.

**Upsert without an upsert endpoint.** GoTrue has separate create and update endpoints. The wizard calls `getProvider(identifier)` first: a 404 means create, any other error is a real failure and is rethrown, and a hit means update. Re-running it therefore updates credentials in place rather than creating duplicates.

**More than one provider.** Supabase allows several custom providers per project, each with a `custom:`-prefixed identifier — which is what makes running against a local DevDogs instance and the production one simultaneously possible.

</details>
