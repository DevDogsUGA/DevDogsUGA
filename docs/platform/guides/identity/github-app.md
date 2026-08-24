---
name: The DevDogs GitHub App
description: The App the platform authenticates as on GitHub — why it replaced an owner's personal token, why it does not replace the OAuth app, and how to create, install and rotate it.
order: 3
---

# The DevDogs GitHub App

`apps/platform` authenticates as a GitHub App on every call it makes to GitHub. `env.ts` requires `GH_APP_ID`, `GH_APP_INSTALLATION_ID` and `GH_APP_PRIVATE_KEY`, so the platform will not boot without all three — though the placeholders in `.env.example` are enough to run it locally unless you are working on the organization integration.

Read this if you are creating, installing, rotating or operating that App. If what you want is to let another project sign DevDogs members in, that is [Sign in with DevDogs](/docs/platform/guides/identity/oauth) instead.

## Why an App rather than a token

Every GitHub call the platform makes is an **organization administration** action: creating teams, granting repository access, writing rulesets, inviting and removing members. All of it used to go through one classic `ghp_` token belonging to an org **owner**, so a compromise of the deployed Worker was an organization takeover — every repo, every setting, every member, and any _other_ organization that owner happens to belong to.

An App does not make compromise less likely. It caps what compromise reaches:

- Permissions are **declared and fixed**; nothing widens them at run time.
- Installation tokens **expire after an hour**. A leaked `ghp_` token is valid until somebody notices and revokes it.
- It is **not a person**. Nobody graduates, and revoking it does not depend on remembering which officer's account the club was quietly relying on.

## ⚠️ It does NOT replace the OAuth app

**Keep the existing GitHub OAuth app.** It is configured in `supabase/config.toml` as `[auth.external.github]` with `GH_CLIENT_ID` / `GH_CLIENT_SECRET`, and it is what links a member's GitHub profile to their Supabase identity. Leave the App's "Identifying and authorizing users" section **empty**.

The reason is specific and load-bearing. In `server/auth/providers/github.ts`, `requestAuthorization` asks Supabase for `scopes: "write:org user:email"`, and `linkProfile` then uses the resulting **user** token to accept the organization invitation on the member's behalf:

```
PATCH /user/memberships/orgs/{org}   { "state": "active" }
```

That endpoint is gated on the **`write:org` OAuth scope** — and _GitHub Apps do not have OAuth scopes at all_. A GitHub App's user-to-server token is bounded by the App's installation permissions, not by requested scopes, and org-membership acceptance is not among the endpoints it can reach.

So moving member login onto the App would leave every new member with a **pending invitation they must find in their email and accept by hand** — a silent regression in the one flow that has to be frictionless, since it is how students get repository access on the day they join.

Two further reasons to keep them separate, both smaller. **Different lifecycles:** the App is infrastructure, the OAuth app is a login provider, and rotating or reinstalling one should not sign anybody out. **Different blast radii:** the App's private key mints organization-administration tokens, while the OAuth client secret authenticates end users; merging them puts both behind one revocation decision.

## Creating it

Create it in the **organization**, not your personal account — a personal App is exactly the single point of failure this exists to remove. It installs on `DevDogsUGA` and nowhere else, and it is created by hand in GitHub's UI.

The App holds exactly five permissions: `administration: write`, `contents: write`, `metadata: read`, `pull_requests: read`, and `members: write`. **`Organization administration` is deliberately not among them** — nothing calls it, and it reaches the org settings themselves, including the rulesets and base permissions this whole change exists to tighten. It is the one permission that would put the App back where the token was.

<details>
<summary>Field by field: what to enter on the New GitHub App form</summary>

**Settings → Developer settings → GitHub Apps → New GitHub App**, as an organization app under `DevDogsUGA`.

| Field           | Value                                                                              |
| --------------- | ---------------------------------------------------------------------------------- |
| GitHub App name | `DevDogs Platform`                                                                 |
| Homepage URL    | `https://devdogsuga.org`                                                           |
| Description     | Team provisioning, repository access and branch rulesets for DevDogs competitions. |

**Identifying and authorizing users:** leave every field blank, and leave "Request user authorization (OAuth) during installation" unchecked. Member login stays on the OAuth app because it needs `write:org`.

**Post installation:** Setup URL blank, "Redirect on update" unchecked. A setup URL is for Apps needing per-installation configuration; this one is installed once, on one organization.

**Webhook:** Active, URL `https://devdogsuga.org/github/webhook`, secret the value of `GH_WEBHOOK_SECRET`, SSL verification enabled. The route is `apps/platform/src/app/(api)/github/webhook/route.ts`; it verifies `X-Hub-Signature-256` and **refuses with 503 when that value is empty**, because an unsigned endpoint that writes `submissionState` would let anyone on the internet mark a team as having merged.

**Permissions.** Repository: Administration read and write (`repos.createRepoRuleset`, `getRepoRulesets`, `updateRepoRuleset`, `deleteRepoRuleset`, `teams.addOrUpdateRepoPermissionsInOrg`); Contents read and write (`git.createRef`, `git.getRef`, cutting team branches); Metadata read-only (mandatory); Pull requests read-only (the webhook payload). Organization: Members read and write (`teams.create`, `getByName`, `listMembersInOrg`, `removeMembershipForUserInOrg`, and the org invitation and membership endpoints). Account permissions: none.

**Subscribe to events:** Pull request, and nothing else. It is the only event the route handles; anything else gets a 200 and is ignored.

**Where can this be installed:** only on this account.

⚠️ If a **repository webhook** already points at the same URL, delete it once the App's webhook is confirmed working. Two deliveries are harmless — `applyPullRequestEvent` is safe to replay — but two places to update the secret is one place to forget.

</details>

<details>
<summary>After creating it: keys, installation, and the seven steps to a working deploy</summary>

Run this for **each** App — production first, then staging with the reduced permissions.

1. **Generate a private key.** _General → Private keys._ It downloads a `.pem`. This is the credential: it mints installation tokens indefinitely, and GitHub will not show it again.
2. **Install it** on `DevDogsUGA`, **All repositories**. `GITHUB_COMPETITION_REPO` defaults to this repository, so "Only select repositories" would work today — but a future competition repo would fail with a 404 that reads like a missing repo rather than a missing installation.
3. **Collect three values:** `GH_APP_ID` from _General → About_, `GH_APP_INSTALLATION_ID` from the installation's URL (`.../settings/installations/<id>`), and `GH_APP_PRIVATE_KEY`, the `.pem`.
4. **Put them in the root `.env`.** The key goes on **one line**, double-quoted, with `\n` escapes:

   ```bash
   GH_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIEow...\n-----END RSA PRIVATE KEY-----\n"
   ```

   The newlines are load-bearing: a key that lost them parses as a string and fails to sign, surfacing as an opaque JWT error at the first team provision rather than at boot. `env.ts` rejects a value that is a file path or an id instead of a PEM, which catches the common version of this.

5. **Push it.** The two ids are GitHub environment **variables** (both appear in any webhook payload); the key is a secret. `pnpm devtools env push --target production`, or `--target staging`. Each target has its own file — `.env.production`, `.env.staging` — and `env pull --target <target>` brings one back.
6. **Delete the `ghp_` token** under _Settings → Developer settings → Personal access tokens_. Not last for tidiness: until it is revoked, the thing this change removes is still valid.
7. **Verify the grant matches the intent:**

   ```bash
   gh api orgs/DevDogsUGA/installations \
     --jq '.installations[] | {app: .app_slug, perms: .permissions}'
   ```

   Expect exactly `administration: write`, `contents: write`, `metadata: read`, `pull_requests: read`, `members: write` on production. Anything else was a mis-tick, and this is the cheapest moment to find it.

</details>

## Operating it

Staging is **read-only against GitHub, by construction**: its App holds only `metadata: read` and `pull_requests: read`. A `members` or `administration` entry there is the mistake that matters.

<details>
<summary>Why does staging get a second App with different permissions?</summary>

**There is only one GitHub organization.** Staging cannot have a staging org — teams, invitations, rulesets and member removals all land in the real `DevDogsUGA` — so a staging deployment holding `Members: write` can invite and remove actual students and rewrite actual rulesets.

And staging is the **less** guarded environment: it deploys from `main` on every push, with no reviewer in front of it. Giving it org-write would make a bad merge more dangerous than the owner token this whole change removed.

|              | `DevDogs Platform`                                                 | `DevDogs Platform (staging)`                    |
| ------------ | ------------------------------------------------------------------ | ----------------------------------------------- |
| Webhook      | `https://devdogsuga.org/github/webhook`                            | `https://staging.devdogsuga.org/github/webhook` |
| Repository   | Administration + Contents write, Metadata read, Pull requests read | Metadata read, Pull requests read               |
| Organization | Members write                                                      | _none_                                          |
| Private key  | `production`                                                       | `staging`                                       |

Read-only degrades correctly rather than crashing: `provisionTeam` and its neighbours return `failed("api_error", …)` on a 403, so the console shows a clear failure instead of a 500. Nothing in staging calls GitHub unprompted either — `wrangler.jsonc` gives staging `"crons": []`, so `github-reconcile` runs on production alone.

Separate keys matter for the same reason as separate permissions: sharing production's key would mean a staging compromise mints production-capable tokens. `preflight` needs no App at all — nothing ever boots from `.env.preflight`.

</details>

<details>
<summary>Rotating the private key</summary>

Generate the new key **before** deleting the old one. An App can hold two at once, and that overlap is what keeps the platform running through the change.

```bash
pnpm devtools env push --target production   # the new key
# redeploy, confirm a team provision works
# then delete the old key in the App's settings
```

</details>
