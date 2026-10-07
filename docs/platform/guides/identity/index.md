---
name: Identity
description: The two DevDogs identities — the OAuth provider other projects sign users in with, and the GitHub App the platform authenticates as — and which one you actually need.
order: 1
section: guides
---

# Identity

Two things in this repository are called "the DevDogs identity", and they point in opposite directions. Read the row that matches what you are doing and skip the other.

|              | [Sign in with DevDogs](../../../_shared/getting-started/running.md) | [The DevDogs GitHub App](../../../toolkit/infrastructure/github-app.md)                    |
| ------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| What it is   | DevDogs Auth acting as an OAuth 2.1 / OIDC provider                 | the machine account the platform (`apps/platform` in Backstage) authenticates as on GitHub |
| Direction    | **inbound** — another project signs a DevDogs member in             | **outbound** — the platform administers the `DevDogsUGA` organization                      |
| Who needs it | a sibling project adding a sign-in button                           | whoever deploys or operates the platform                                                   |
| Credential   | a client id and secret, per project, from `/tools/oauth`            | `GH_APP_ID`, `GH_APP_INSTALLATION_ID` and `GH_APP_PRIVATE_KEY`                             |
| Set up by    | `pnpm devtools oauth`, run in the consuming project                 | by hand in GitHub's UI, once, then `backstage env push`                                    |

The difference that matters: one issues identity to other people's apps, the other is an identity the platform holds. Neither authenticates the other.

## Who can create an account

DevDogs Auth accepts new public users only when their email is in the exact
`uga.edu` domain. The `before_user_created` hook in `supabase/config.toml` calls
`platform.require_uga_signup_email`, so the same check covers password and OAuth
signup paths before an Auth user is written. Supabase's service-role admin API
intentionally bypasses Auth hooks; possession of that key is already database
administrator authority and must remain server-only.

## What a Sign in with DevDogs token is good for

Sign in with DevDogs is for local development only. Deployed apps share the platform's own sign-in and never use it. A client's tokens are limited to match, by the `custom_access_token` hook (`platform.restrict_oauth_tokens`):

- **Who:** a token is issued only to the member who registered the client at `/tools/oauth`, or to one of that member's test accounts. Any other account, and any client with no registration, is refused at the code exchange and again on every refresh.
- **What:** an issued token carries `role = oauth_identity`, which has no database privileges. The userinfo endpoint answers it, and that is all your local stack should need: GoTrue reads userinfo once, creates a local user, and issues its own session. The same token sent to the platform's REST, Storage or RPC endpoints is refused with `permission denied`.

## A third thing, easily confused with both

The GitHub **OAuth app** — configured as `[auth.external.github]` in `supabase/config.toml` with `GH_CLIENT_ID` and `GH_CLIENT_SECRET` — is what links a member's GitHub profile to their Supabase identity. It is not either column above, and the GitHub App does **not** replace it: member login needs an OAuth scope that GitHub Apps do not have at all. That is the first thing the [GitHub App](../../../toolkit/infrastructure/github-app.md) page covers, and getting it wrong silently breaks the day a student joins.
