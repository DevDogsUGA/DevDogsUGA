# Secrets

Every deployed secret lives in **Bitwarden Secrets Manager**. GitHub holds only
the token that opens it, and the deploy reads the rest at run time.

## The shape

Two BWS projects, three machine accounts:

| GitHub environment | Secrets come from                                 | Branch policy |
| ------------------ | ------------------------------------------------- | ------------- |
| `dry-run`          | GitHub env secrets                                | `main`        |
| `staging`          | `devdogs-staging`                                 | `main`        |
| `production`       | `devdogs-production`                              | `production`  |
| `production-apply` | `devdogs-production` + its own GitHub env secrets | `production`  |

| Machine account | Projects             | Permission | Token lives                                |
| --------------- | -------------------- | ---------- | ------------------------------------------ |
| `staging`       | `devdogs-staging`    | read       | GitHub environment `staging`               |
| `production`    | `devdogs-production` | read       | GitHub `production` and `production-apply` |
| `admin`         | **both**             | read/write | a maintainer's Password Manager vault      |

The free plan allows 3 projects, 3 machine accounts and 2 users. This spends 2
projects and 3 accounts, leaving one project spare.

**Why `dry-run` is not a project.** It was, briefly. But `bws` has no user
authentication — no `bws login`, no SSO, only a machine account token — so
somebody has to hold a write-capable account, and three projects meant all three
accounts were CI identities that must stay read-only. The only way to push was
to temporarily grant write to a CI account and remember to take it back. That is
a revocation somebody eventually forgets, and it forgets _silently_, leaving a
write token in a GitHub environment.

Dropping the `dry-run` project buys back the slot for a dedicated `admin`
account. Its two credentials become GitHub environment secrets instead, which is
affordable precisely because they are read-only **by construction**: a Postgres
role that can see one table, and a PAT with `schema.bases:read`. Nothing that
holds them can change anything.

**The `admin` token never goes in GitHub.** CI stays read-only and
single-project, so a CI compromise is no worse than before — while the write
path stops depending on anyone's memory.

> **Two credentials must not go in the shared production project.**
> `AIRTABLE_APPLY_PAT` is write-capable, and `SUPABASE_ACCESS_TOKEN` carries
> full account privileges across both Supabase organizations. If either sat in
> `devdogs-production` the ordinary deploy could read it — which would make the
> `production-apply` reviewer gate decorative. Both are GitHub environment
> secrets on `production-apply` alone, and `bws push` refuses them rather than
> trusting anyone to remember.

## Commands

```bash
pnpm devtools bws diff --env staging     # compare local file to project
pnpm devtools bws pull --env staging     # project → .env.staging
pnpm devtools bws push --env staging     # .env.staging → project
pnpm devtools bws push --env staging --prune   # also delete what the file omits
```

All three need `BWS_ACCESS_TOKEN`. `diff` and `pull` work with any account that
can read the project; `push` needs the **admin** account. It is read from the
environment only — never a flag, because a flag puts a token that unlocks a
whole environment into shell history and `ps` on every invocation.

**Values are never printed.** The diff shows key names and fingerprints:

```
+ CLOUDFLARE_API_TOKEN  (40 chars, v…3)
~ DISCORD_TOKEN  70 chars, M…8 → 72 chars, M…q
? OLD_KEY  only in the project
```

A fingerprint distinguishes a rotation from a paste error and cannot be used to
reconstruct anything, so the output is safe to paste into a chat window — which
is exactly where it ends up.

### Editing a secret

```bash
export BWS_ACCESS_TOKEN=...            # the ADMIN account, not a CI token
pnpm devtools bws pull --env staging   # writes .env.staging
$EDITOR .env.staging
pnpm devtools bws diff --env staging   # read-only, shows what would change
pnpm devtools bws push --env staging
rm .env.staging
```

The two CI tokens are read-only, so a `push` with one fails rather than
half-succeeding. That is the intended failure: the only credential that can
change a deployed secret lives with a person, not in GitHub.

> The free plan allows **2 Secrets Manager users**. Two people total can
> administer this — allocate the second seat for succession rather than
> convenience, and keep the break-glass export current.

## Rules the tooling enforces

| Rule                                                      | Why                                                                                                                                                                                      |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `push` never deletes without `--prune`                    | A key missing from a file is far more often an incomplete edit than an intentional removal.                                                                                              |
| `production` always prompts, and `--yes` is refused there | `--yes` exists so CI can run unattended, and CI has no business pushing production secrets.                                                                                              |
| Non-secrets are rejected                                  | `DEPLOY_ENV`, `BASE_URL`, `NEXT_PUBLIC_*` and friends are committed or GitHub environment _variables_. A value with two sources of truth resolves to whichever the reader did not check. |
| Empty values are rejected                                 | An empty secret reads as "configured" to every consumer that checks for presence.                                                                                                        |
| Files are `.env.<env>`, never `.env`                      | Pulling production over the file `pnpm dev` reads has no undo.                                                                                                                           |
| Pulling an empty project writes nothing                   | An empty file looks exactly like a successful pull.                                                                                                                                      |

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
