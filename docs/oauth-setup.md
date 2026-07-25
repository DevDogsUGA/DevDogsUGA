# Sign in with DevDogs — OAuth Setup CLI

`@devdogsuga/oauth-setup` is a CLI wizard that configures another project's local [Supabase](https://supabase.com) instance to support **Sign in with DevDogs** OAuth. It is intended for developers of sibling DevDogs-UGA projects (e.g. the Community Resource Forum) who need to integrate DevDogs authentication without hand-writing SQL or reading internal Supabase schema documentation.

## Purpose

DevDogs-Website's Supabase Auth instance doubles as a standards-compliant OAuth 2.1 / OIDC provider. Sibling projects can let their users log in with their DevDogs account by:

1. Registering an OAuth client on the [DevDogs console](https://devdogsuga.org/tools/oauth) to get a client ID and secret.
2. Adding a custom OIDC provider row to their own local Supabase instance pointing at DevDogs Auth.

Step 2 has always been a manual, undocumented SQL operation. This CLI automates it end-to-end.

## Installation

Run the wizard directly with `pnpm dlx` (no install required):

```bash
pnpm dlx @devdogsuga/oauth-setup
```

Or install it as a dev dependency in your project:

```bash
pnpm add -D @devdogsuga/oauth-setup
pnpm devdogs-oauth-setup
```

## Prerequisites

- **Local Supabase running** — `supabase start` must have been run in your project directory. The CLI auto-detects credentials via `supabase status`.
- **Supabase CLI installed** — available at [supabase.com/docs/guides/cli](https://supabase.com/docs/guides/cli).
- **OAuth client registered** — visit [devdogsuga.org/tools/oauth](https://devdogsuga.org/tools/oauth), sign in (link your GitHub account if prompted), enable OAuth, and copy your Client ID and Client Secret. The secret is shown only once.

## Usage

```bash
devdogs-oauth-setup [--base-url <url>]
```

| Flag               | Description                                             |
| ------------------ | ------------------------------------------------------- |
| `--base-url <url>` | DevDogs API URL (default: `https://api.devdogsuga.org`) |
| `--help`, `-h`     | Print usage                                             |

The wizard reads from `process.env`, so credentials can come from any source — shell exports, `direnv`, a `.env` file loaded by your shell, etc. Credentials are saved back to `.env.local` on completion so subsequent runs are instant.

| Variable              | Description                                                   |
| --------------------- | ------------------------------------------------------------- |
| `OAUTH_BASE_URL`      | DevDogs API URL                                               |
| `OAUTH_PROVIDER_NAME` | Display name shown on the sign-in button (default: `DevDogs`) |
| `OAUTH_CLIENT_ID`     | OAuth client ID                                               |
| `OAUTH_CLIENT_SECRET` | OAuth client secret                                           |

## Wizard walkthrough

1. **DevDogs API URL** — URL of the DevDogs Supabase Auth server. Defaults to the production instance. Override for local DevDogs development.
2. **Provider display name** — Label shown to users on the sign-in button. Defaults to `DevDogs`.
3. **OAuth credentials** — Client ID and secret from the DevDogs console. If credentials are already saved in `.env.local`, you're prompted to confirm or replace them.
4. **Local Supabase detection** — The CLI runs `supabase status -o env` to find your instance's API URL and service role key automatically. If Supabase isn't running, it shows troubleshooting steps and lets you retry.
5. **Provider check** — If a `custom:devdogs` provider already exists, you can choose to update it or register an additional provider under a different identifier (e.g. `custom:devdogs-staging` for a local DevDogs instance).
6. **Upsert** — Creates or updates the provider row via the Supabase Admin SDK.
7. **Persist** — Writes credentials to `.env.local`.
8. **Next steps** — Prints a checklist with the exact Supabase callback URL to register and a ready-to-paste `signInWithOAuth` snippet.

## After running

Once the wizard completes:

1. **Register your Supabase callback URL** in the [DevDogs console](https://devdogsuga.org/tools/oauth):

   - Local: `http://127.0.0.1:54321/auth/v1/callback`
   - Production: `https://<your-project>.supabase.co/auth/v1/callback`

2. **Allow your app's callback** in `supabase/config.toml`:

   ```toml
   [auth]
   additional_redirect_urls = ["http://localhost:<port>/auth/callback"]
   ```

3. **Trigger sign-in** from your app:

   ```typescript
   await supabase.auth.signInWithOAuth({
     provider: "custom:devdogs",
     options: { redirectTo: `${origin}/auth/callback` },
   });
   ```

## Implementation notes

### Why the Supabase Admin SDK instead of direct SQL

Supabase's custom OAuth provider table (`auth.custom_oauth_providers`) lives in the `auth` schema, which PostgREST does not expose — only the `public` schema is reachable via the standard REST API. The correct interface is GoTrue's `/admin/custom-oauth-providers` HTTP endpoints, which `@supabase/supabase-js` v2.108+ wraps as `supabase.auth.admin.customProviders.{createProvider,updateProvider,getProvider}`. This is the same API the Supabase dashboard uses internally.

### Why `supabase status -o env` for credentials

The Admin SDK needs a service role key, which is secret and should not be committed. Rather than prompting the developer to find and paste it, the CLI shells out to `supabase status -o env`, which prints all local instance credentials as environment variables. Parsing it with `dotenv.parse()` gives `API_URL` and `SERVICE_ROLE_KEY` directly. This also means the CLI stays in sync with whatever port and credentials the local instance actually started on — no hardcoded defaults that break when Supabase is configured differently.

### OIDC auto-discovery

The provider is registered with `provider_type: "oidc"` and only an `issuer` URL (`{baseUrl}/auth/v1`). Supabase GoTrue fetches `{issuer}/.well-known/openid-configuration` automatically to resolve the authorize, token, and userinfo endpoints. This means the CLI doesn't need to know or hardcode any of those URLs.

### Why `process.env` instead of parsing `.env` files

Different sibling projects may store environment variables in different ways — shell exports, `direnv` (`.envrc`), `.env` files loaded by the shell, or other conventions. Tying the CLI to one loading strategy (e.g. Next.js's `.env` precedence chain) would break for projects that don't follow it. Reading `process.env` directly keeps the CLI agnostic: callers load variables however they prefer before running `devdogs-oauth-setup`. Saved output still goes to `.env.local` since that is the conventional gitignored override file for local secrets.

### Upsert without a native upsert endpoint

GoTrue has separate create and update endpoints with no upsert primitive. The CLI calls `getProvider(identifier)` first: a 404 error means the provider does not exist yet (call `createProvider`); any other error is a real failure (rethrow); a successful response means it already exists (call `updateProvider`). This is idempotent — re-running the wizard updates credentials in place without creating duplicates.

### Multiple provider support

Supabase allows multiple custom OAuth providers per project, each with a unique identifier (required prefix: `custom:`). The wizard detects an existing `custom:devdogs` provider and offers the choice to update it or register a second provider under a new identifier. This covers the case where a developer wants to run against both a local DevDogs instance and the production one simultaneously.
