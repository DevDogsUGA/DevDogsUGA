---
name: The DevDogs GitHub App
description: Creating and configuring the App the platform authenticates as — every field, why it is set that way, and why it does not replace the OAuth app that links member accounts.
---

# The DevDogs GitHub App

> **Status: code done, App not yet created.** `apps/platform` authenticates as
> the App on every GitHub call. Until the App exists and the three
> `GH_APP_*` values are set, **the platform will not boot** — `env.ts`
> requires them.

## Why

Every GitHub call the platform makes is an **organization administration**
action: creating teams, granting repository access, writing rulesets, inviting
and removing members. All of it went through one classic `ghp_` token belonging
to an org **owner**, so a compromise of the deployed Worker was an organization
takeover — every repo, every setting, every member, and any _other_ organization
that owner happens to belong to.

An App does not make compromise less likely. It caps what compromise reaches:

- Permissions are **declared and fixed**; nothing widens them at run time.
- Installation tokens **expire after an hour**. A leaked `ghp_` token is valid
  until somebody notices and revokes it.
- It is **not a person**. Nobody graduates, and revoking it does not depend on
  remembering which officer's account the club was quietly relying on.

## ⚠️ It does NOT replace the OAuth app

**Keep the existing GitHub OAuth app.** It is configured in
`supabase/config.toml` as `[auth.external.github]` with `GH_CLIENT_ID` /
`GH_CLIENT_SECRET`, and it is what links a member's GitHub profile to their
Supabase identity. Leave the App's "Identifying and authorizing users" section
**empty**.

The reason is specific and load-bearing. `requestAuthorization` asks Supabase
for these scopes:

```ts
scopes: "write:org user:email",
```

and `linkProfile` then uses the resulting **user** token to auto-accept the
organization invitation on the member's behalf:

```
PATCH /user/memberships/orgs/{org}   { "state": "active" }
```

That endpoint is gated on the **`write:org` OAuth scope** — and _GitHub Apps do
not have OAuth scopes at all_. A GitHub App's user-to-server token is bounded by
the App's installation permissions, not by requested scopes, and org-membership
acceptance is not among the endpoints it can reach.

So moving member login onto the App would leave every new member with a
**pending invitation they must find in their email and accept by hand** — a
silent regression in the one flow that has to be frictionless, since it is how
students get repository access on the day they join.

Two further reasons to keep them separate, both smaller:

- **Different lifecycles.** The App is infrastructure; the OAuth app is a login
  provider. Rotating or reinstalling one should not sign anybody out.
- **Different blast radii.** The App's private key mints org-administration
  tokens. The OAuth client secret authenticates end users. Merging them puts
  both behind one revocation decision.

> For the record, switching the OAuth client would _not_ break existing links:
> `auth.identities` keys on the GitHub numeric user id, which is the same
> whichever client authorized it. That is not the reason to keep it — the
> `write:org` scope is.

---

## Creating it

**Settings → Developer settings → GitHub Apps → New GitHub App**, as an
organization app under `DevDogsUGA`.

> ⚠️ Create it in the **organization**, not your personal account. A personal
> App is exactly the single point of failure this change exists to remove.

### Basic

| Field               | Value                                                                              |
| ------------------- | ---------------------------------------------------------------------------------- |
| **GitHub App name** | `DevDogs Platform`                                                                 |
| **Homepage URL**    | `https://devdogsuga.org`                                                           |
| **Description**     | Team provisioning, repository access and branch rulesets for DevDogs competitions. |

### Identifying and authorizing users

**Leave every field blank, and leave "Request user authorization (OAuth) during
installation" unchecked.** See [above](#-it-does-not-replace-the-oauth-app) —
member login stays on the OAuth app because it needs the `write:org` scope.

### Post installation

| Field                  | Value         |
| ---------------------- | ------------- |
| **Setup URL**          | _leave blank_ |
| **Redirect on update** | unchecked     |

A setup URL is for Apps that need per-installation configuration — repository
pickers, first-run wizards. This App is installed exactly once, on one
organization, and everything it needs is committed or in Bitwarden. A setup URL
would be a route to build, secure, and then never visit again.

### Webhook

| Field                | Value                                   |
| -------------------- | --------------------------------------- |
| **Active**           | ✅ checked                              |
| **Webhook URL**      | `https://devdogsuga.org/github/webhook` |
| **Webhook secret**   | the value of `GH_WEBHOOK_SECRET`        |
| **SSL verification** | ✅ Enable                               |

The route is `apps/platform/src/app/(api)/github/webhook/route.ts`. It verifies
`X-Hub-Signature-256` against `GH_WEBHOOK_SECRET` and **refuses with 503
when that value is empty** — an unsigned endpoint that writes `submissionState`
would let anyone on the internet mark a team as having merged, which awards a
star.

> ⚠️ If a **repository webhook** already points at this URL, delete it after the
> App's webhook is confirmed working. Two deliveries of the same
> `pull_request` event are harmless — `applyPullRequestEvent` is safe to replay
> — but two places to update the secret is one place to forget.

Staging needs its own App. See below — one App has exactly one webhook URL, and
that is not the main reason.

### Permissions

Derived from the call sites, not from a template. Every one of these is used;
nothing here is speculative.

**Repository permissions**

| Permission         | Access         | Needed by                                                                                                                           |
| ------------------ | -------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Administration** | Read and write | `repos.createRepoRuleset`, `getRepoRulesets`, `updateRepoRuleset`, `deleteRepoRuleset`, and `teams.addOrUpdateRepoPermissionsInOrg` |
| **Contents**       | Read and write | `git.createRef`, `git.getRef` — cutting team branches                                                                               |
| **Metadata**       | Read-only      | mandatory; GitHub selects it automatically                                                                                          |
| **Pull requests**  | Read-only      | the `pull_request` webhook payload                                                                                                  |

**Organization permissions**

| Permission  | Access         | Needed by                                                                                                                                                 |
| ----------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Members** | Read and write | `teams.create`, `getByName`, `listMembersInOrg`, `removeMembershipForUserInOrg`, `POST /orgs/{org}/invitations`, `DELETE /orgs/{org}/memberships/{login}` |

**Account permissions:** none.

> ⚠️ Do **not** grant `Organization administration`. Nothing calls it, and it
> reaches org settings themselves — including the rulesets and base permissions
> this plan exists to tighten. It is the single permission that would put the
> App back where the PAT was.

### Subscribe to events

| Event            | Why                                                                        |
| ---------------- | -------------------------------------------------------------------------- |
| **Pull request** | The only event the route handles. Anything else gets a 200 and is ignored. |

Leave every other event unchecked. An event nobody handles is delivery volume,
log noise, and a payload with member data arriving somewhere it is not needed.

### Staging gets a second App — with different permissions

**Two Apps, and deliberately not two of the same App.**

|              | `DevDogs Platform`                                                              | `DevDogs Platform (staging)`                    |
| ------------ | ------------------------------------------------------------------------------- | ----------------------------------------------- |
| Webhook      | `https://devdogsuga.org/github/webhook`                                         | `https://staging.devdogsuga.org/github/webhook` |
| Repository   | Administration **write**, Contents **write**, Metadata read, Pull requests read | Metadata **read**, Pull requests **read**       |
| Organization | Members **write**                                                               | _none_                                          |
| Private key  | `production` project                                                            | `staging` project                               |

The webhook URL is the visible reason and the least important one. The real one:

**There is only one GitHub organization.** Staging cannot have a staging org —
teams, invitations, rulesets and member removals all land in the real
`DevDogsUGA`. So a staging deployment holding `Members: write` can invite and
remove actual students and rewrite actual rulesets.

And staging is the **less** guarded environment: it deploys from `main` on every
push, with no reviewer in front of it. Giving it org-write would make a bad
merge more dangerous than the org-owner PAT this whole change removed, because
at least the PAT lived behind a deploy nobody could trigger by merging.

So staging is **read-only against GitHub, by construction**. It still boots,
still receives `pull_request` deliveries, and still exercises the state machine
that `applyPullRequestEvent` drives — which is the part worth testing. What it
cannot do is change anything.

Read-only degrades correctly rather than crashing: `provisionTeam` and its
neighbours return `failed("api_error", …)` on a 403, so the console shows a
clear failure instead of a 500. Nothing in staging calls GitHub unprompted
either — `wrangler.jsonc` gives staging `"crons": []`, so `github-reconcile`
runs on production alone.

Separate keys matter for the same reason as separate permissions: staging's
Worker secrets are a different blast radius, and sharing production's key would
mean a staging compromise mints production-capable tokens.

> `preflight` needs no App. That tier runs migration and schema dry runs, not the
> Next app, so it never constructs `env`.

Everything else about the staging App matches the tables above: same events,
same "only on this account", same install on all repositories.

### Where can this GitHub App be installed?

**Only on this account.** One organization; "any account" is for Apps
distributed to strangers, and would let anyone install something named after the
club. Both Apps install on `DevDogsUGA` and nowhere else.

---

## After creating it

Run this for **each** App — production first, then staging with the reduced
permissions. `--target staging` and `--target production` keep the two sets
apart the whole way.

1. **Generate a private key.** _General → Private keys → Generate a private
   key._ Downloads a `.pem`. This is the credential — it mints installation
   tokens indefinitely, and GitHub will not show it again.
2. **Install it** on `DevDogsUGA`, **All repositories**.
   - `GITHUB_COMPETITION_REPO` is this repository, so "Only select
     repositories" would work today — but team provisioning writes rulesets and
     branches here, and a future competition repo would fail with a 404 that
     reads like a missing repo rather than a missing installation.
3. **Collect three values.**

   | Value                    | Where                                                     |
   | ------------------------ | --------------------------------------------------------- |
   | `GH_APP_ID`              | App settings → _General → About → App ID_                 |
   | `GH_APP_INSTALLATION_ID` | the installation's URL: `.../settings/installations/<id>` |
   | `GH_APP_PRIVATE_KEY`     | the `.pem` you downloaded                                 |

4. **Put them in the root `.env`.** The key goes on **one line**, double-quoted,
   with `\n` escapes:

   ```bash
   GH_APP_ID="123456"
   GH_APP_INSTALLATION_ID="12345678"
   GH_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIEow...\n-----END RSA PRIVATE KEY-----\n"
   ```

   The newlines are load-bearing: a key that lost them parses as a string and
   fails to sign, which surfaces as an opaque JWT error at the first team
   provision rather than at boot. `env.ts` refines the value to reject a file
   path or an id pasted in its place, which catches the common version of this.

5. **Push it.** The two ids are GitHub environment **variables** (both appear in
   any webhook payload); the key is a secret:

   ```bash
   pnpm devtools env push --target production   # or --target staging
   ```

   Each target has its own file — `.env.production`, `.env.staging` — so the
   two sets no longer share one, and `env pull --target <target>` brings back
   whichever set you are working on.

6. **Delete the `ghp_` token** at _Settings → Developer settings → Personal
   access tokens_. Not last for tidiness — until it is revoked, the thing this
   whole change removes is still valid.

7. **Verify the grant matches the intent:**

   ```bash
   gh api orgs/DevDogsUGA/installations \
     --jq '.installations[] | select(.app_slug=="devdogs-platform") | .permissions'
   ```

   Expect exactly `administration: write`, `contents: write`, `metadata: read`,
   `pull_requests: read`, `members: write`. Anything else was a mis-tick, and
   this is the cheapest moment to find it.

   For staging, expect **only** `metadata: read` and `pull_requests: read`. A
   `members` or `administration` entry there is the mistake that matters: it
   gives the unreviewed environment write access to the real organization.

   ```bash
   gh api orgs/DevDogsUGA/installations \
     --jq '.installations[] | {app: .app_slug, perms: .permissions}'
   ```

## Rotating the private key

Generate the new key **before** deleting the old one — an App can hold two at
once, and the overlap is what keeps the platform running through the change.

```bash
pnpm devtools env push --target production   # new key → Bitwarden + GitHub
# redeploy, confirm a team provision works
# then delete the old key in the App's settings
```

## What the API cannot do

For anyone who reaches for automation here: **no endpoint creates a GitHub
App.** The manifest flow still requires a browser POST and a redirect;
`POST /app-manifests/{code}/conversions` only completes a flow a browser
started. Uninstalling a third-party App and changing the org's PAT policy are
likewise UI-only — see the plan's §5.6a.
