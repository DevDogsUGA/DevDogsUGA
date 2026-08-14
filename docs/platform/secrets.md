# Secrets

**Bitwarden Secrets Manager is the source of truth. GitHub environment secrets
are a derived copy, and what deploy jobs actually read.**

```
        ┌── secrets pull ──┐                 ┌── secrets push ──┐
        v                  │                 v                  v
   your .env <─────────────┴── Bitwarden ────┴──> GitHub environment secrets
        │                                                       │
        └── secrets audit ──> compares all four <───────────────┘
                              (+ Cloudflare Worker secrets)
```

One local `.env`. `push` writes **Bitwarden and GitHub in the same run**,
because a value in one and not the other is the failure this design has.

## Commands

```bash
pnpm devtools secrets pull  --env staging      # Bitwarden → your .env, in place
pnpm devtools secrets push  --env staging      # your .env → Bitwarden → GitHub
pnpm devtools secrets audit --env staging      # compare all four stores
```

Leave `--env` off and it asks. The picker is ordered least- to most-dangerous,
so a reflexive Enter selects `dry-run` and never `production`; it refuses to
prompt when stdin is not a terminal, because a prompt nobody can answer hangs
until the job times out.

You need `BWS_ACCESS_TOKEN` (the admin machine account) exported, and a
`gh auth login` with admin on the repository. The Bitwarden token is read from
the environment only — never a flag, because a flag puts a token that unlocks a
whole environment into shell history and `ps` on every invocation.

### It edits `.env` in place

The root `.env` is the file `pnpm dev` reads, and it is mostly commentary —
which value breaks the Supabase CLI when empty, which must stay commented out,
why. So `pull` edits **lines**, not a parsed map: untouched lines come back
byte-for-byte, ordering survives, and every note stays where its key is.

- **Nothing is deleted.** A key that should go away is commented out, so the
  previous value stays recoverable from the file rather than from somebody's
  memory. Setting a commented key revives that line instead of appending a
  second copy.
- **`pull --env production` warns and defaults to no.** It points your local app
  at production, and there is no undo.

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
| `dry-run`          | `devdogs-dry-run`    | everything in the project    | `main`       |
| `staging`          | `devdogs-staging`    | everything in the project    | `main`       |
| `production`       | `devdogs-production` | everything EXCEPT apply-only | `production` |
| `production-apply` | `devdogs-production` | ONLY the apply-only keys     | `production` |

Four GitHub environments, three Bitwarden projects. The last two split one
project, and **that split is the reviewer gate**: `production` deploys on a push
with nothing in front of it, `production-apply` has required reviewers. A
write-capable credential reaching the first would make the second decorative.

So `secrets push --env production` writes **two** GitHub environments in one
run, routing each key to exactly one of them, and confirms them separately —
agreeing to update production's ordinary secrets is not agreeing to touch the
credentials behind the reviewers. The routing is derived from the table above
rather than written down twice.

> **Two credentials go to `production-apply` alone.** `AIRTABLE_APPLY_PAT` is
> write-capable, and `SUPABASE_ACCESS_TOKEN` carries full account privileges
> across both Supabase organizations (it is what `supabase config push` needs,
> and the one mutation with no dry run). Both live in the `devdogs-production`
> Bitwarden project — only a person reads that — and are kept out of the staging
> and dry-run projects entirely, since a copy there is a second thing to rotate
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
a value. `secrets audit` is what polices that.

## The audit

```bash
pnpm devtools secrets audit --env production
```

| Store        | Exposes             | So it is checked for         |
| ------------ | ------------------- | ---------------------------- |
| local `.env` | names AND values    | value drift                  |
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
| `.env` and Bitwarden disagree on a value               | The only value comparison available anywhere in this system.                                                            |
| In Bitwarden, not in its GitHub environment            | The deploy cannot see it.                                                                                               |
| In GitHub, but the **wrong** environment               | An apply-only credential sitting in `production` makes the reviewer gate decorative. Presence alone calls this healthy. |
| Rotated in Bitwarden **after** GitHub was last updated | ⚠️ See below.                                                                                                           |

| ! warning                                  | Why it matters                                                                                                                                             |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| In GitHub or on a Worker, not in Bitwarden | An orphan from a rename. `wrangler deploy --secrets-file` **preserves what it omits**, so a renamed variable leaves its secret on the Worker indefinitely. |
| In your `.env`, not in Bitwarden           | A local-only value, or one somebody forgot to push.                                                                                                        |
| In Bitwarden, missing from your `.env`     | You are about to push an incomplete set.                                                                                                                   |

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
export BWS_ACCESS_TOKEN=...                    # the admin machine account
pnpm devtools secrets pull  --env production   # start from what is live
$EDITOR .env                                   # change the one value
pnpm devtools secrets push  --env production   # → Bitwarden AND GitHub
pnpm devtools secrets audit --env production   # must report no drift
```

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
| Keys are commented out of `.env`, never deleted                  | A removal has to be recoverable from the file rather than from somebody's memory.                                                                                                        |
| Non-secrets are skipped                                          | `DEPLOY_ENV`, `BASE_URL`, `NEXT_PUBLIC_*` and friends are committed or GitHub environment _variables_. A value with two sources of truth resolves to whichever the reader did not check. |
| Empty values are skipped                                         | An empty secret reads as "configured" to every consumer that checks for presence.                                                                                                        |
| Pulling an empty project writes nothing                          | An empty result and a successful pull look identical afterwards.                                                                                                                         |
| Apply-only keys route to `production-apply` and nowhere else     | `production` deploys with no reviewer in front of it; a write-capable credential there makes the gate decorative.                                                                        |
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

## Break-glass

A lapsed subscription or a lost machine account locks you out of your own
deploys, and org billing follows whoever was treasurer. Keep an export of each
project in the **Password Manager** vault, and re-export after any rotation.
