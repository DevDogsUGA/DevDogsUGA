# Secrets

Every deployed secret lives in **Bitwarden Secrets Manager**. GitHub holds only
the token that opens it, and the deploy reads the rest at run time.

## The shape

One BWS project and one machine account per GitHub environment that carries
secrets:

| GitHub environment | BWS project          | Machine account | Branch policy |
| ------------------ | -------------------- | --------------- | ------------- |
| `dry-run`          | `devdogs-dry-run`    | read-only       | `main`        |
| `staging`          | `devdogs-staging`    | read-only       | `main`        |
| `production`       | `devdogs-production` | read-only       | `production`  |
| `production-apply` | `devdogs-production` | _(reuses it)_   | `production`  |

`dry-run` is named for what it does rather than for a noun: it holds the two
credentials that let a merge to `main` report what a promotion _would_ change,
and neither of them can change anything.

Three projects and three machine accounts. That is **exactly** the Secrets
Manager free-tier ceiling, so there is no headroom — a fourth environment means
a paid plan. Worth knowing before anyone proposes `preview`.

`production-apply` is a fourth GitHub environment but not a fourth project. It
runs against the same values with required reviewers in front of it, so it
reuses `production`'s machine account.

> **One credential must not be shared that way.** `AIRTABLE_APPLY_PAT` is
> write-capable, and if it sat in the shared project the ordinary production
> deploy could read it — which would make the reviewer gate decorative. It
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

### Getting write access

> ⚠️ **`bws` cannot authenticate as you.** There is no `bws login`, no
> email/password, no SSO — the CLI accepts a machine account access token and
> nothing else. Secrets Manager splits its surfaces on purpose: the web vault is
> where humans work, the CLI is where machines do.

That leaves a gap, because the free plan allows **3 machine accounts** and this
design already spends all three on `dry-run`, `staging` and `production` — which
are CI identities and stay **read-only**. There is no fourth account to be the
write one.

The way through is that a machine account's permission is **per project and
changeable after creation** — "Can read" or "Can read, write", on its Projects
tab. So writing is a deliberate, temporary act:

```bash
# 1. In the web vault: set that environment's machine account to
#    "Can read, write" on its project.
export BWS_ACCESS_TOKEN=...            # that environment's token
pnpm devtools bws pull --env staging   # writes .env.staging
$EDITOR .env.staging
pnpm devtools bws diff --env staging   # read-only, shows what would change
pnpm devtools bws push --env staging
pnpm devtools bws diff --env staging   # must now report a match
rm .env.staging
# 2. Set the machine account back to "Can read".
```

**Step 2 is the one that gets forgotten**, and forgetting it leaves a
write-capable token sitting in a GitHub environment. Treat the closing `diff`
as the reminder: it is the last command that needs the elevated grant, so the
moment it reports a match, go and revoke.

The alternative is entering values by hand in the web vault with your own
account, which needs no grant at all. It is the better choice for one or two
values and the worse one for forty — a mistyped `DB_URL` fails at 2am, and
`push` from a file you can read beats a web form for that.

> The free plan also allows only **2 Secrets Manager users**. Whoever holds
> those two seats is the whole bench for this; plan the second seat around
> officer turnover rather than convenience.

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
