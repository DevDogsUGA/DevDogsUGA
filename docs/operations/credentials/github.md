---
name: GitHub
description: The organization, its OAuth app and the tokens - who owns them, how to rotate each, and what to do if both owners are unreachable.
order: 2
section: infrastructure
---

# GitHub

## Owner and admins

- **Owner of the account:** the DevOps/Platform officer runs it day to day.
- **Organization owners:** the President and the Vice President. Only they can change organization settings ([Owner-only actions](../repositories/owner-actions.md)).
- **Admins:** the `admins` team, a break-glass bypass on the rulesets.

## What it issues

| Credential                                                                        | Used for                                                                                           | Lives in                        |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------- |
| The GitHub OAuth app (`GH_CLIENT_ID`, `GH_CLIENT_SECRET`)                         | Members signing in with GitHub                                                                     | Bitwarden, Supabase auth config |
| `WORKSHOPS_READ_TOKEN`                                                            | A fine-grained token that reads the private workshop repositories, for the slides build            | A repository secret             |
| The read-only GitHub App (`GH_APP_ID`, `GH_APP_PRIVATE_KEY`, `GH_WEBHOOK_SECRET`) | Merged pull requests for member profiles ([Contributions](../../platform/guides/contributions.md)) | Bitwarden, the platform Worker  |
| Renovate                                                                          | A GitHub App (Mend's), installed by an owner                                                       | The App's own installation      |

The platform holds no GitHub App that administers the organization: teams and competitions left the platform, and with them that administration. The OAuth app signs members in. The one App it uses is read-only (`devdogs-platform`, and a staging twin): it reports merged pull requests and nothing else.

## Rotating

- **The OAuth client secret:** generate a second secret in the OAuth app, put it in Bitwarden as `GH_CLIENT_SECRET`, push, then edit `supabase/config-push.stamp` and deploy (the deploy only pushes the config when `config.toml`, a seed or that stamp changed; its `config push` sends the secret to Supabase), sign in with GitHub to test, then delete the old secret.
- **`WORKSHOPS_READ_TOKEN`:** create a new fine-grained token with _Contents: read_ on the workshop repositories and this one, replace the repository secret, re-run the slides workflow, then revoke the old token. Whoever created the old one must revoke it from their own account.
- **A personal account leaving:** remove them from the organization, then check for tokens, Apps and secrets they created (Settings, Developer settings are per-account and invisible to the rest of us).

## Recovery

- **Lost access to the DevOps account:** an organization owner adds another officer to `devops` and `admins`. No credential is held only by that person.
- **Both owners unreachable:** contact GitHub Support and prove control of the club: the organization's verified domain (`devdogsuga.org`, a DNS record) and the club mailbox are the evidence. Keep that DNS access with the Cloudflare account ([Cloudflare](./cloudflare.md)) so there is always a second route. Do not plan around this; keep two owners.
