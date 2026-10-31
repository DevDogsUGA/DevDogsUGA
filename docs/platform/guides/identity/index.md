---
name: Identity
description: The DevDogs identity other projects sign users in with, how an account is created, and what an OAuth token is good for.
order: 1
section: guides
---

# Identity

"The DevDogs identity" means one thing: **Sign in with DevDogs**, DevDogs Auth acting as an OAuth 2.1 / OIDC provider. It is **inbound**: another project signs a DevDogs member in. Whoever adds a sign-in button to a sibling project needs it; the credential is a client id and secret, per project, from `/dashboard/oauth`, and `pnpm devtools oauth` sets it up in the consuming project. See [Getting started: Running](../../../_shared/getting-started/running.md).

The platform used to hold a second identity, a GitHub App it authenticated as to administer the `DevDogsUGA` organization (teams, branch rulesets, invitations). That integration is deleted along with Teams and competitions, and its credentials (`GH_APP_ID`, `GH_APP_INSTALLATION_ID`, `GH_APP_PRIVATE_KEY`, `GH_WEBHOOK_SECRET`) are gone from the env contract. The platform no longer calls GitHub as an App, and linking a GitHub account does not add anyone to the organization.

## Who can create an account

DevDogs Auth accepts new public users only when their email is in the exact
`uga.edu` domain. The `before_user_created` hook in `supabase/config.toml` calls
`platform.require_uga_signup_email`, so the same check covers password and OAuth
signup paths before an Auth user is written. Supabase's service-role admin API
intentionally bypasses Auth hooks; possession of that key is already database
administrator authority and must remain server-only.

## Two tiers of client

Every OAuth client is registered at `/dashboard/oauth` with a tier, chosen once at creation; a database trigger refuses any later change.

|                | Development                                                                            | Production                                                                                                                          |
| -------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| For            | a member's own local-stack testing                                                     | a DevDogs app (DogDays, DogPack) signing its members in                                                                             |
| Created by     | any member with a linked GitHub account, or `devtools oauth`                           | only someone holding `canManageOAuthApps` (President and DevOps Director)                                                           |
| Visible to     | its owner                                                                              | everyone holding `canManageOAuthApps`                                                                                               |
| Consent        | only the owner sees the form, and approves as themselves or one of their test accounts | approved automatically for whoever is signed in                                                                                     |
| Return address | any `http(s)` URI                                                                      | only `https://<project>.supabase.co/auth/v1/callback`: a product's own Supabase project                                             |
| Audited        | no                                                                                     | creating, deleting, rolling the secret and changing a redirect URI each write an entry to `/dashboard/audit-log` (`oauth_client.*`) |

The consent page (`/oauth/consent`) decides on the server, before anything renders. A request with no `authorization_id`, a stale one, a client nobody registered, a production client whose authorization does not return to a Supabase callback, or a development client that is not yours, all get the same 404.

A production client cannot be deleted until another live production client exists: the delete form names the replacement, and the audit entry records it. Roll a production secret from `/dashboard/oauth`; it is shown once. Each audited change and its GoTrue call share one transaction, so an entry never exists for a change that did not happen, and a secret is never rolled without its entry.

Unlinking GitHub on `/dashboard/profile` deletes the member's development clients (they are gated on GitHub) and never touches a production client, whoever created it.

## What a Sign in with DevDogs token is good for

A client's tokens are limited by the `custom_access_token` hook (`platform.restrict_oauth_tokens`), which only downgrades. Whatever the tier, and whoever signed in, a token that carries an OAuth client gets `role = oauth_identity`, which has no database privileges, on the first code exchange and on every refresh. The userinfo endpoint answers it; the same token sent to the platform's REST, Storage or RPC endpoints is refused with `permission denied`. A token with no client (the platform's own sign-in) passes through untouched.

A downgraded token is not an inert one. GoTrue authenticates a bearer for its own `/auth/v1/user` endpoints by signature and `sub`, so an OAuth client's access token, and the ID token it receives with it (which the hook never sees and which carries no role), could rewrite the member's record, set a password, or start linking an identity. Three guards close that, none of them in the hook:

- **The platform's session check** (`expectSession`) accepts only a token with role `authenticated` and no `client_id`. A client's token in the session cookie signs nobody in.
- **No passwords.** A database trigger on `auth.users` refuses any change of `encrypted_password` to a non-empty value. OAuth is the only way into a deployed project; local test personas are created with their password, which is an insert.
- **Identity links the platform started.** A second identity is added to an account only if the platform recorded a link intent for that member and provider (`platform."identityLinkIntents"`, written from a first-party session just before `linkIdentity`, good for fifteen minutes and one link), or if the identity's verified email is the account's own (GoTrue's automatic linking). The first identity of an account is always allowed.

What a client's token can still do at `/auth/v1/user` is write `user_metadata`, which any member can already do to themselves, and sign the member out of every session. Do not trust `user_metadata` for anything that matters.

Who may sign in to which client is the consent page's job, not the hook's. One gap is accepted: GoTrue's own consent endpoint accepts any signed-in session, so a member with a script could approve someone else's _development_ client as themselves. All they get is the downgraded identity token.

## The issuer

The issuer a product registers is whatever the platform's discovery document returns (`<API_URL>/auth/v1/.well-known/openid-configuration`), shown with a copy button on `/dashboard/oauth`. It is Supabase's to choose, not ours: it is the project's `https://<project>.supabase.co/auth/v1`, GoTrue stamps it on every ID token, and a provider configured with any other string, a custom domain included, fails its check. After any change to the host in front of the platform project, run `pnpm --dir apps/platform exec tsx scripts/check-oauth-issuer.ts --api-url <url>` and register what it prints.

## How a member's GitHub profile is linked

The GitHub **OAuth app**, configured as `[auth.external.github]` in `supabase/config.toml` with `GH_CLIENT_ID` and `GH_CLIENT_SECRET`, is what links a member's GitHub profile to their Supabase identity. Linking it is one of the verification steps and is needed to register an OAuth client. It requests only `user:email` and does not add the member to the GitHub organization.
