# Secrets

**Bitwarden Secrets Manager is the source of truth. GitHub environment secrets
are a derived copy, and what deploy jobs actually read.**

```
Bitwarden ──bws pull──> .env.<env> ──gh push──> GitHub environment secrets
   ^                                                      |
   └────────── bws push ──────────┘            deploy reads ${{ secrets.* }}
```

## The shape

| GitHub environment | BWS project          | Receives                     | Branch       |
| ------------------ | -------------------- | ---------------------------- | ------------ |
| `dry-run`          | `devdogs-dry-run`    | everything in the project    | `main`       |
| `staging`          | `devdogs-staging`    | everything in the project    | `main`       |
| `production`       | `devdogs-production` | everything EXCEPT apply-only | `production` |
| `production-apply` | `devdogs-production` | ONLY the apply-only keys     | `production` |

Four GitHub environments, three Bitwarden projects. The last two split one
project, and **that split is the reviewer gate**: `production` deploys on a push
with nothing in front of it, `production-apply` has required reviewers. A
write-capable credential reaching the first would make the second decorative, so
`gh push` enforces the routing rather than leaving it to whoever last edited a
file.

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
a value. `gh status` is what polices that — see below.

> **Two credentials go to `production-apply` alone.** `AIRTABLE_APPLY_PAT` is
> write-capable, and `SUPABASE_ACCESS_TOKEN` carries full account privileges
> across both Supabase organizations (it is what `supabase config push` needs,
> and the one mutation with no dry run). Both live in the `devdogs-production`
> Bitwarden project — only a person reads that — and `gh push --env production`
> refuses them.

## Commands

```bash
pnpm devtools bws diff --env staging     # compare local file to project
pnpm devtools bws pull --env staging     # project → .env.staging
pnpm devtools bws push --env staging     # .env.staging → project
pnpm devtools bws push --env staging --prune   # also delete what the file omits
```

```bash
pnpm devtools gh push   --env production   # .env.production → GitHub secrets
pnpm devtools gh status --env production   # is GitHub behind Bitwarden?
```

`bws` needs `BWS_ACCESS_TOKEN` (the admin account), read from the environment
only — never a flag, because a flag puts a token that unlocks a whole
environment into shell history and `ps` on every invocation. `gh` uses your own
`gh auth login`, and setting environment secrets needs admin on the repository.

**Values are never printed.** The diff shows key names and fingerprints:

```
+ CLOUDFLARE_API_TOKEN  (40 chars, v…3)
~ DISCORD_TOKEN  70 chars, M…8 → 72 chars, M…q
? OLD_KEY  only in the project
```

A fingerprint distinguishes a rotation from a paste error and cannot be used to
reconstruct anything, so the output is safe to paste into a chat window — which
is exactly where it ends up.

### Rotating a secret

```bash
export BWS_ACCESS_TOKEN=...                 # the admin machine account
pnpm devtools bws pull   --env production    # writes .env.production
$EDITOR .env.production
pnpm devtools bws diff   --env production    # read-only, shows what would change
pnpm devtools bws push   --env production    # → Bitwarden (source of truth)
pnpm devtools gh  push   --env production    # → GitHub (what CI reads)
pnpm devtools gh  status --env production    # must report up to date
rm .env.production
```

⚠️ **Step 5 without step 6 is the failure mode this whole design has.** A
credential rotated in Bitwarden and never pushed to GitHub leaves production
authenticating with the old value, and everything looks healthy until the old
one is revoked. `gh status` is the only thing that catches it: it compares each
secret's Bitwarden `revisionDate` against GitHub's `updatedAt` and reports
anything GitHub is behind on.

It cannot compare _values_ — nothing can — so it answers "was GitHub updated
after Bitwarden last changed?" rather than "do these match?". That is the
weaker question, and it is the one that catches the mistake people actually
make.

> The free plan allows **2 Secrets Manager users**. Two people total can
> administer this — allocate the second seat for succession rather than
> convenience, and keep the break-glass export current.

## Rules the tooling enforces

| Rule                                                         | Why                                                                                                                                                                                      |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `push` never deletes without `--prune`                       | A key missing from a file is far more often an incomplete edit than an intentional removal.                                                                                              |
| `production` always prompts, and `--yes` is refused there    | `--yes` exists so CI can run unattended, and CI has no business pushing production secrets.                                                                                              |
| Non-secrets are rejected                                     | `DEPLOY_ENV`, `BASE_URL`, `NEXT_PUBLIC_*` and friends are committed or GitHub environment _variables_. A value with two sources of truth resolves to whichever the reader did not check. |
| Empty values are rejected                                    | An empty secret reads as "configured" to every consumer that checks for presence.                                                                                                        |
| Files are `.env.<env>`, never `.env`                         | Pulling production over the file `pnpm dev` reads has no undo.                                                                                                                           |
| Pulling an empty project writes nothing                      | An empty file looks exactly like a successful pull.                                                                                                                                      |
| `gh push` refuses apply-only keys outside `production-apply` | `production` deploys with no reviewer in front of it; a write-capable credential there makes the gate decorative.                                                                        |
| `gh push` sends values on **stdin**, one process per secret  | `--body` would put a live credential in argv. `--env-file` would hand the file to a second dotenv parser, which agrees with this one until a multi-line value and then differs silently. |

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

## Break-glass

A lapsed subscription or a lost machine account locks you out of your own
deploys, and org billing follows whoever was treasurer. Keep an export of each
project in the **Password Manager** vault, and re-export after any rotation.
