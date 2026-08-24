---
name: Identity
description: The two DevDogs identities — the OAuth provider other projects sign users in with, and the GitHub App the platform authenticates as — and which one you actually need.
order: 1
---

# Identity

Two things in this repository are called "the DevDogs identity", and they point in opposite directions. Read the row that matches what you are doing and skip the other.

|              | [Sign in with DevDogs](/docs/platform/guides/identity/oauth) | [The DevDogs GitHub App](/docs/platform/guides/identity/github-app)   |
| ------------ | ------------------------------------------------------------ | --------------------------------------------------------------------- |
| What it is   | DevDogs Auth acting as an OAuth 2.1 / OIDC provider          | the machine account `apps/platform` authenticates as on GitHub        |
| Direction    | **inbound** — another project signs a DevDogs member in      | **outbound** — the platform administers the `DevDogsUGA` organization |
| Who needs it | a sibling project adding a sign-in button                    | whoever deploys or operates the platform                              |
| Credential   | a client id and secret, per project, from `/tools/oauth`     | `GH_APP_ID`, `GH_APP_INSTALLATION_ID` and `GH_APP_PRIVATE_KEY`        |
| Set up by    | `pnpm devtools oauth`, run in the consuming project          | by hand in GitHub's UI, once, then `pnpm devtools env push`           |

The difference that matters: one issues identity to other people's apps, the other is an identity the platform holds. Neither authenticates the other.

## A third thing, easily confused with both

The GitHub **OAuth app** — configured as `[auth.external.github]` in `supabase/config.toml` with `GH_CLIENT_ID` and `GH_CLIENT_SECRET` — is what links a member's GitHub profile to their Supabase identity. It is not either column above, and the GitHub App does **not** replace it: member login needs an OAuth scope that GitHub Apps do not have at all. That is the first thing the [GitHub App](/docs/platform/guides/identity/github-app) page covers, and getting it wrong silently breaks the day a student joins.
