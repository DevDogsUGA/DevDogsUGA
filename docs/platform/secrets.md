# Secrets

Every deployed secret lives in **Bitwarden Secrets Manager**. GitHub holds only
the token that opens it, and the deploy reads the rest at run time.

## The shape

One BWS project and one machine account per GitHub environment that carries
secrets:

| GitHub environment | BWS project          | Machine account | Branch policy |
| ------------------ | -------------------- | --------------- | ------------- |
| `plan`             | `devdogs-plan`       | read-only       | `main`        |
| `staging`          | `devdogs-staging`    | read-only       | `main`        |
| `production`       | `devdogs-production` | read-only       | `production`  |
| `production-apply` | `devdogs-production` | _(reuses it)_   | `production`  |

Three projects and three machine accounts. That is **exactly** the Secrets
Manager free-tier ceiling, so there is no headroom — a fourth environment means
a paid plan. Worth knowing before anyone proposes `preview`.

`production-apply` is a fourth GitHub environment but not a fourth project. It
runs against the same values with required reviewers in front of it, so it
reuses `production`'s machine account.

> **One credential must not be shared that way.** `AIRTABLE_APPLY_PAT` is
> write-capable, and if it sat in the shared project the ordinary production
> deploy could read it — which would make the plan/apply split decorative. It
> stays a GitHub _environment secret_ on `production-apply` alone. `bws push`
> refuses to upload it rather than trusting anyone to remember.

## Commands

```bash
pnpm devtools bws diff --env staging     # compare local file to project
pnpm devtools bws pull --env staging     # project → .env.staging
pnpm devtools bws push --env staging     # .env.staging → project
pnpm devtools bws push --env staging --prune   # also delete what the file omits
```

All three need `BWS_ACCESS_TOKEN` set to that environment's machine account
token. It is read from the environment only — never a flag, because a flag puts
a token that unlocks a whole environment into shell history and `ps` on every
invocation.

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
export BWS_ACCESS_TOKEN=...          # a WRITE-capable machine account
pnpm devtools bws pull --env staging # writes .env.staging
$EDITOR .env.staging
pnpm devtools bws diff --env staging # read-only, shows what would change
pnpm devtools bws push --env staging
rm .env.staging
```

The deploy tokens stored in GitHub are **read-only**. Pushing needs a
write-capable machine account, which is deliberately not the one CI holds.

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
