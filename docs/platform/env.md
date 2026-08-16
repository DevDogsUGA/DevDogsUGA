# Env

**Bitwarden Secrets Manager is the source of truth. GitHub environment secrets
are a derived copy, and what deploy jobs actually read.**

```
        ┌──── env pull ────┐                 ┌──── env push ────┐
        v                  │                 v                  v
  .env.staging <───────────┴── Bitwarden ────┴──> GitHub environment secrets
        │                                                       │
        └──── env audit ───> compares all four <────────────────┘
                              (+ Cloudflare Worker secrets)
```

One env file per target. `push` writes **Bitwarden and GitHub in the same
run**, because a value in one and not the other is the failure this design has.

## One `--target`, one row

Everything per-target is read from a single table
([`packages/env/src/targets.ts`](../../packages/env/src/targets.ts)):

| `--target`    | File              | Bitwarden project    | Valid `DEPLOY_ENV`? |
| ------------- | ----------------- | -------------------- | ------------------- |
| `development` | `.env`            | — none               | yes                 |
| `preflight`   | `.env.preflight`  | `devdogs-preflight`  | **no**              |
| `staging`     | `.env.staging`    | `devdogs-staging`    | yes                 |
| `production`  | `.env.production` | `devdogs-production` | yes                 |

> ⚠️ **This used to be two vocabularies behind one flag**, and they overlapped
> in the middle: a deploy environment
> (`development | staging | production`, deciding which FILE) and a Bitwarden
> environment (`preflight | staging | production`, deciding which PROJECT).
> `init --env staging` created `.env.staging`; `push --env staging` read the
> root `.env`. So filling in `.env.staging` and pushing it uploaded the
> DEVELOPMENT values to the staging project and reported success. `--target`
> is one row, and `pull`, `push` and `audit` all default their file from it.

Two rows are asymmetric, and both on purpose:

- **`development` has no Bitwarden project.** `.env` is your own file; there is
  no shared development credential set to sync it against. `pull`, `push` and
  `audit` refuse `--target development` by name rather than falling through to
  some default project.
- **`preflight` is not a deploy environment.** `.env.preflight` is a staging
  area for pushing credentials into the preflight project; nothing boots from
  it, and `DEPLOY_ENV=preflight` is refused. The preflight credentials are
  read-only by construction, so an app started against them would fail
  feature-by-feature rather than at startup.

## Commands

```bash
pnpm devtools env pull  --target staging   # Bitwarden → .env.staging, in place
pnpm devtools env push  --target staging   # .env.staging → Bitwarden → GitHub
pnpm devtools env audit --target staging   # compare all four stores
```

`--file` overrides the file a target implies. It is an override for odd jobs,
not the way to choose a target.

Leave `--target` off and it asks. The picker is ordered least- to
most-dangerous, so a reflexive Enter selects `preflight` and never
`production`; it refuses to prompt when stdin is not a terminal, because a
prompt nobody can answer hangs until the job times out.

You need a `gh auth login` with admin on the repository, and the Secrets Manager
access token — which the tool will find for you.

### Where the access token lives, and how it is found

**The Bitwarden Password Manager vault** — the same account, the other product.
That is where it belongs, because `bws` has no user authentication at all (no
`bws login`, no SSO) and cannot store the token itself: `bws config` covers
server URLs and a state directory and nothing else.

The tool looks in four places, in order, and stops at the first hit:

| Order | Source               | Notes                                          |
| ----- | -------------------- | ---------------------------------------------- |
| 1     | `--access-token`     | ⚠️ visible to `ps`, and lands in shell history |
| 2     | `BWS_ACCESS_TOKEN`   | the ordinary way for scripts and CI            |
| 3     | your Bitwarden vault | needs the `bw` CLI, signed in                  |
| 4     | asking you           | masked, with an offer to save it to the vault  |

Explicit beats ambient, so `--access-token` wins over the environment: somebody
passing it while `BWS_ACCESS_TOKEN` is set is overriding on purpose, and quietly
using the environment instead would point the command at the account they were
trying to avoid.

**The vault path is the one to use.** Nothing to export, nothing in history:

```bash
npm i -g @bitwarden/cli && bw login     # once
pnpm devtools env audit --target staging
```

The first run finds nothing, asks for the token, and offers to store it as
_"DevDogs Secrets Manager access token (admin)"_. Every run after that reads it
back. If the vault is locked it **asks before unlocking** — a tool that pops a
master-password prompt unannounced is shaped exactly like the thing people are
told never to type their master password into — and the password is typed
straight into `bw`, never through this tool. Set `BW_SESSION` to skip that.

The token never passes through argv in any direction: `bws` gets it through its
environment, the vault write pipes base64 JSON through `bw`'s **stdin**, and the
vault read puts only the item's name on the command line. `bws` does accept
`--access-token` and this tool declines to use it, which is why option 1 above
carries a warning when you use it — it is the one path that trades that away.

> ⚠️ **Never put it in `.env`.** The pull toward doing so is strong, because
> `with-env` loads that file for every command and it would save re-exporting
> each session. But `.env` is what `env push --file .env` uploads, and the
> result is the
> master key stored inside all three boxes it opens, then synced to GitHub where
> CI can read it — which contradicts the one property this whole design rests
> on.
>
> `push` refuses it by name rather than trusting anyone to remember, `pull` will
> not write it back, and `audit` reports it as an **error** in any remote store.
> Same for `AIRTABLE_PAT`, the scaffolding token, which the runtime never reads
> — see the `neverStore` declarations in each package's `env.ts`.

### It edits the target's file in place

An env file is mostly commentary — which value breaks the Supabase CLI when
empty, which must stay commented out, why. So `pull` edits **lines**, not a
parsed map: untouched lines come back byte-for-byte, ordering survives, and
every note stays where its key is.

- **Nothing is deleted.** A key that should go away is commented out, so the
  previous value stays recoverable from the file rather than from somebody's
  memory. Setting a commented key revives that line instead of appending a
  second copy.
- **`pull --target production` warns and defaults to no.** Anything that loads
  `.env.production` is then pointed at production, and there is no undo.

### Values are never printed

Changes show as key names and fingerprints:

```
+ CLOUDFLARE_API_TOKEN  (40 chars, v…3)
~ DISCORD_TOKEN  70 chars, M…8 → 72 chars, M…q
? OLD_KEY  only in the project — left alone
```

A fingerprint distinguishes a rotation from a paste error and cannot be used to
reconstruct anything, so the output is safe to paste into a chat window — which
is exactly where it ends up.

## The shape

| GitHub environment | BWS project          | Receives                     | Branch       |
| ------------------ | -------------------- | ---------------------------- | ------------ |
| `preflight`        | `devdogs-preflight`  | everything in the project    | `main`       |
| `staging`          | `devdogs-staging`    | everything in the project    | `main`       |
| `production`       | `devdogs-production` | everything EXCEPT apply-only | `production` |
| `production-apply` | `devdogs-production` | ONLY the apply-only keys     | `production` |

Four GitHub environments, three Bitwarden projects. The last two split one
project, and **that split is the reviewer gate**: `production` deploys on a push
with nothing in front of it, `production-apply` has required reviewers. A
write-capable credential reaching the first would make the second decorative.

So `env push --target production` writes **two** GitHub environments in one
run, routing each key to exactly one of them, and confirms them separately —
agreeing to update production's ordinary secrets is not agreeing to touch the
credentials behind the reviewers. The routing is derived from the table above
rather than written down twice.

> **Two credentials go to `production-apply` alone.** `AIRTABLE_APPLY_PAT` is
> write-capable, and `SUPABASE_ACCESS_TOKEN` carries full account privileges
> across both Supabase organizations (it is what `supabase config push` needs,
> and the one mutation with no dry run). Both live in the `devdogs-production`
> Bitwarden project — only a person reads that — and are kept out of the staging
> and preflight projects entirely, since a copy there is a second thing to rotate
> for no benefit.

### One machine account

| Used                                                     | Free plan |
| -------------------------------------------------------- | --------- |
| 3 projects                                               | 3         |
| **1 machine account** — `admin`, read/write on all three | 3         |
| 1–2 users                                                | 2         |

Because CI reads GitHub rather than Bitwarden, **nothing machine-shaped ever
authenticates to Secrets Manager**. There are no CI machine accounts to scope,
rotate or leak — just one admin account, held by a person, in the Password
Manager vault. Two accounts spare.

That also settles a problem the earlier design had no good answer to: `bws` has
no user authentication (no `bws login`, no SSO, access token only), so _somebody_
has to hold a write-capable account. When all three accounts were CI identities
that had to stay read-only, the only way to push was to grant write temporarily
and remember to take it back — a revocation that fails silently.

### Why route through GitHub at all

- **`${{ secrets.* }}` is masked in workflow logs automatically.** A value pulled
  at run time is not, unless somebody remembers `::add-mask::` for every one —
  and the run where they forget is the run that prints it.
- The deploy stops depending on the `bws` binary and on Bitwarden being
  reachable. A secrets outage should not also be a deploy outage.

**The cost is a second copy that cannot be read back.** GitHub secrets are
write-only: `gh secret list` returns names and `updatedAt`, and no route returns
a value. `env audit` is what polices that.

## The audit

```bash
pnpm devtools env audit --target production
```

| Store        | Exposes             | So it is checked for         |
| ------------ | ------------------- | ---------------------------- |
| the env file | names AND values    | value drift                  |
| Bitwarden    | names AND values    | value drift (the truth)      |
| GitHub       | names + `updatedAt` | presence, routing, staleness |
| Cloudflare   | names only          | orphans                      |

**That asymmetry is the whole design.** Only the local file can be compared to
Bitwarden by _value_, because the two downstream stores are write-only. So a
clean audit does not mean "everything matches" — it means "nothing detectable is
wrong", and the report says which is which rather than implying the stronger
claim.

What it catches, in severity order:

| ✗ error                                                | Why it matters                                                                                                          |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| The env file and Bitwarden disagree on a value         | The only value comparison available anywhere in this system.                                                            |
| In Bitwarden, not in its GitHub environment            | The deploy cannot see it.                                                                                               |
| In GitHub, but the **wrong** environment               | An apply-only credential sitting in `production` makes the reviewer gate decorative. Presence alone calls this healthy. |
| Rotated in Bitwarden **after** GitHub was last updated | ⚠️ See below.                                                                                                           |

| ! warning                                  | Why it matters                                                                                                                                             |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| In GitHub or on a Worker, not in Bitwarden | An orphan from a rename. `wrangler deploy --secrets-file` **preserves what it omits**, so a renamed variable leaves its secret on the Worker indefinitely. |
| In your env file, not in Bitwarden         | A local-only value, or one somebody forgot to push.                                                                                                        |
| In Bitwarden, missing from your env file   | You are about to push an incomplete set.                                                                                                                   |

⚠️ **A rotation pushed to Bitwarden and never propagated is the failure this
whole design has.** Production keeps authenticating with the old value and
everything looks healthy until the old one is revoked. Names alone cannot catch
it — both stores have the key — so the audit compares each secret's Bitwarden
`revisionDate` against GitHub's `updatedAt`. It cannot ask "do these match?",
because nothing can; it asks "was GitHub updated after Bitwarden last changed?".
That is the weaker question, and it is the one that catches the mistake people
actually make.

An unknown or unparseable date counts as **current**, not stale. "Unknown means
behind" turns one malformed timestamp into a report that says everything is
broken, after which nobody reads any of it — including on the run where
something really is.

The Cloudflare axis is one-directional on purpose: a Worker holding a secret
nobody stores is an orphan worth reporting, but a secret _absent_ from a given
Worker is usually correct — `DISCORD_TOKEN` belongs to platform and nothing
else — and flagging that would bury the real orphans in noise.

### Rotating a secret

```bash
pnpm devtools env pull  --target production   # start from what is live
$EDITOR .env.production                       # change the one value
pnpm devtools env push  --target production   # → Bitwarden AND GitHub
pnpm devtools env audit --target production   # must report no drift
```

No `export` step — the access token comes from your vault. See
[how it is found](#where-the-access-token-lives-and-how-it-is-found).

`push` does both stores in one run, so the old two-step gap is gone — but the
audit still earns its place, because skipping the GitHub half at its prompt
leaves Bitwarden ahead, and the tool says so at the time.

> The free plan allows **2 Secrets Manager users**. Two people total can
> administer this — allocate the second seat for succession rather than
> convenience, and keep the break-glass export current.

## Rules the tooling enforces

| Rule                                                             | Why                                                                                                                                                                                      |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overwrites are confirmed **separately** from additions           | Answering yes to "create three new secrets" must not also be answering yes to "replace a live credential".                                                                               |
| `production` always prompts, and `--yes` is refused there        | `--yes` exists so a script can run unattended, and nothing unattended has business pushing production secrets.                                                                           |
| Secrets in the project and not in the file are **never** removed | A key missing from a file is far more often an incomplete edit than an intentional deletion. They are reported and left alone.                                                           |
| Keys are commented out of the file, never deleted                | A removal has to be recoverable from the file rather than from somebody's memory.                                                                                                        |
| Non-secrets are skipped                                          | `DEPLOY_ENV`, `BASE_URL`, `NEXT_PUBLIC_*` and friends are committed or GitHub environment _variables_. A value with two sources of truth resolves to whichever the reader did not check. |
| Empty values are skipped                                         | An empty secret reads as "configured" to every consumer that checks for presence.                                                                                                        |
| Pulling an empty project writes nothing                          | An empty result and a successful pull look identical afterwards.                                                                                                                         |
| Apply-only keys route to `production-apply` and nowhere else     | `production` deploys with no reviewer in front of it; a write-capable credential there makes the gate decorative.                                                                        |
| `BWS_ACCESS_TOKEN` and `AIRTABLE_PAT` are refused everywhere     | The first is a key locked inside the box it opens, and in GitHub would let CI read every secret we hold. The second is a scaffolding token the runtime never reads.                      |
| Values go to `gh` on **stdin**, one process per secret           | `--body` would put a live credential in argv. `--env-file` would hand the file to a second dotenv parser, which agrees with this one until a multi-line value and then differs silently. |

## Why the CLI and not the API

Secrets Manager is end-to-end encrypted: the server stores ciphertext and the
key that opens it is derived from the access token _by the client_. A `fetch`
against the REST API with a bearer token returns encrypted blobs, so doing this
without the `bws` binary means reimplementing Bitwarden's crypto.

Install it from
[the Bitwarden docs](https://bitwarden.com/help/secrets-manager-cli/), or
`cargo install bws`.

> ⚠️ `bws secret create` takes the value as a **positional argument**, so it is
> visible to `ps` for the life of the call. The CLI offers no stdin form, so
> this is a property of the tool. Everything here spawns with an argv array and
> `shell: false`, which keeps values out of shell history and away from glob
> expansion — but it cannot hide argv. Do not run `push` on a shared machine.

`gh` is used for the same reason: the value has to be encrypted client-side with
a libsodium sealed box against the environment's public key before it can be
sent, and `gh` does that locally.

> `GITHUB_APP_PRIVATE_KEY` is the multi-line value this tooling exists to
> round-trip intact. Creating and rotating that key is
> [The GitHub App](./github-app.md).

## Break-glass

A lapsed subscription or a lost machine account locks you out of your own
deploys, and org billing follows whoever was treasurer. Keep an export of each
project in the **Password Manager** vault, and re-export after any rotation.
