---
name: Env
description: Bitwarden Secrets Manager is the source of truth and GitHub is the derived copy the deploy reads — one file per target, and where each value ends up.
order: 1
section: guides
---

# Env

**Bitwarden Secrets Manager is the source of truth. GitHub environment secrets
and variables are a derived copy, and what deploy jobs actually read.**

```
        ┌──── env pull ────┐                 ┌──── env push ────┐
        v                  │                 v                  v
  .env.staging <───────────┴── Bitwarden ────┴──> GitHub environment
        │                                                       │
        └──── env audit ───> compares every store <─────────────┘
```

`audit` reaches wider than `push` does. Six stores, not the three drawn above:
the target's env file, Bitwarden, GitHub environment **secrets**, GitHub
environment **variables**, the repository's own variables, and Cloudflare Worker
secrets. Three of those nothing writes on the way through, which is exactly why
they are worth checking.

One env file per target, and `push` writes Bitwarden and GitHub in the same
run — a value in one and not the other is the failure this design has. This
page is what the pieces are; [the commands](./commands.md)
is what to run. A contributor filling in their own `.env` wants
[Secrets and environments](../../infrastructure/secrets.md) instead.

## One `--target`, one row

Every per-target fact is read from a single table,
Backstage's `packages/env/src/targets.ts`:

| `--target`    | File              | Bitwarden project | Valid `DEPLOY_ENV`? |
| ------------- | ----------------- | ----------------- | ------------------- |
| `development` | `.env`            | none              | yes                 |
| `preflight`   | `.env.preflight`  | `preflight`       | **no**              |
| `staging`     | `.env.staging`    | `staging`         | yes                 |
| `production`  | `.env.production` | `production`      | yes                 |

`pull`, `push` and `audit` (`pnpm backstage env …`) all default their file from that row, so
`--target staging` reads and writes `.env.staging` and nothing else.

Two rows are asymmetric, both deliberately:

- **`development` has no Bitwarden project.** `.env` is your own file, and
  there is no shared development credential set to sync it against. The three
  vault commands refuse that target by name rather than falling through to some
  default project.
- **`preflight` is not a deploy environment.** `.env.preflight` is a staging
  area for pushing credentials into the preflight project; nothing boots from
  it, and `DEPLOY_ENV=preflight` is refused. Those credentials are read-only by
  construction, so an app started against them would fail feature by feature
  rather than at startup.

## Where a value ends up

| GitHub environment | Bitwarden project | Receives                             | Branch | Reviewers |
| ------------------ | ----------------- | ------------------------------------ | ------ | --------- |
| `preflight`        | `preflight`       | everything except apply-tier         | `main` | none      |
| `staging`          | `staging`         | everything but plan and apply        | `main` | none      |
| `staging-build`    | `staging`         | the `build: true` keys, as variables | `main` | none      |
| `production`       | `production`      | everything, apply-tier included      | `main` | `devops`  |
| `production-build` | `production`      | the `build: true` keys, as variables | `main` | none      |

Which keys a project holds is the **tier's** decision, named after the jobs that
read each key (`EnvTier` in Backstage's `packages/env/src/meta.ts`). `deploy` is the default
and reaches staging and production; `plan` reaches the two dry-run jobs in
preflight and production, and nothing in staging; `apply` reaches `production`
alone.

**The reviewer gate is `production`'s required reviewers.** Every production
deploy waits for a `devops` approval, and whoever pushed the change can't give
it. An environment that receives apply-tier credentials must require reviewers;
Backstage's tests assert exactly that, so a credential that can rewrite the
project never lands where a deploy runs unreviewed. (Until October 2026 the gate
was a split into `production` and a reviewed `production-apply`; `production`
gained reviewers and the split went away.)

The `*-build` environments hold only the public values the credential-free
builds bake in, as variables and never secrets. Mark such a key `build: true` in
its manifest (`EnvMeta.build`; `define()` refuses it on anything but a public,
per-environment key) and `env push --target staging|production` writes it there
as well, after its own environment, as a separate confirmation. `env audit`
checks them too. Nothing is set by hand. `staging-build` exists in Backstage's
repository, which runs the staging build; push from a checkout of the repository
you mean to write to.

<details>
<summary>Which credentials are apply-tier?</summary>

`SUPABASE_ACCESS_TOKEN` carries full account privileges across both Supabase
organizations; `supabase config push` needs it, and that is the one mutation
with no dry run. It is declared `tier: "apply"` in the operator manifest that
`@devdogsuga/backstage` ships as its own `env.ts` (consumed as a package rather
than a workspace member of this repo; `pnpm devtools check env` keeps the registry in agreement), not
in anything under `apps/*`/`packages/*` here.

It lives in the `production` Bitwarden project like every other production key:
only a person reads that project, one project per environment stays the simplest
thing to rotate, and holding it there is what lets `audit` compare it at all.

</details>

## Secrets and variables are two stores

Bitwarden holds a **whole target**, not its secret half. The public
per-environment values — `PROJECT_REF`, `BASE_URL`, `PUBLISHABLE_KEY` and the
rest — are stored there too, and pushed on to GitHub as _variables_ rather than
secrets.

That is not a nicety in either direction. GitHub masks a secret's value in logs
**by substring**, so `PROJECT_REF` as a secret rewrites every Supabase dashboard
URL and hostname it appears in. And a variable is readable back, which is the
only reason `audit` can compare those keys by value at all. Putting a real
secret in the variable store publishes it to anyone who can read the
repository's Actions config, so the two have separate setters with no boolean
between them.

## Values are never printed

Every command reports key names and fingerprints — a length, plus the first and
last character:

```
+ CLOUDFLARE_API_TOKEN  (40 chars, v…3)
~ DISCORD_TOKEN  70 chars, M…8 → 72 chars, M…q
? OLD_KEY  only in the project — left alone
```

A fingerprint tells a rotation from a paste error and cannot be used to
reconstruct anything, so the output is safe to paste into a chat window — which
is exactly where it ends up. The public values get fingerprints too: they would
be safe to print, and "values are never printed" is a rule worth being able to
state without an exception.

## Why it's like this

<details>
<summary>Why the SDK and not the REST API?</summary>

Secrets Manager is end-to-end encrypted: the server stores ciphertext, and the
key that opens it is derived from the access token _by the client_. A `fetch`
with a bearer token returns encrypted blobs, so the client-side crypto has to
come from Bitwarden.

It comes from `@bitwarden/sdk-napi` — the same Rust core the `bws` binary wraps,
loaded in-process as a dependency of `@devdogsuga/backstage`. Nothing to install, and **values
never appear in argv**: `bws secret create` took the secret as a positional
argument, visible to `ps` for the length of the call. The SDK needs one thing
the binary did not, `BWS_ORG_ID` — the organization's public UUID, set once in
your `.env`. It identifies; the access token authorizes.

`gh` is used for the same reason the SDK is. A secret's value has to be
encrypted client-side with a libsodium sealed box against the environment's
public key before it can be sent, and `gh` does that locally.

</details>

<details>
<summary>Why route through GitHub at all, instead of reading Bitwarden in CI?</summary>

`${{ secrets.* }}` is masked in workflow logs automatically. A value pulled at
run time is not, unless somebody remembers `::add-mask::` for every one — and
the run where they forget is the run that prints it. Routing through GitHub also
stops the deploy depending on Bitwarden being reachable, so a secrets outage is
not also a deploy outage.

The cost is a second copy that cannot be read back: `gh secret list` returns
names and `updatedAt`, and no route returns a value. `env audit` is what polices
that.

</details>

<details>
<summary>Why one machine account, and no CI identity?</summary>

Because CI reads GitHub rather than Bitwarden, nothing machine-shaped ever
authenticates to Secrets Manager. There are no CI machine accounts to scope,
rotate or leak — one `admin` account, held by a person, read/write on all three
projects, with two of the free plan's three spare.

That also settles a problem the earlier shape had no good answer to. `bws` has
no user authentication at all — no login, no SSO, access token only — so
_somebody_ has to hold a write-capable account. When all three accounts were CI
identities that had to stay read-only, the only way to push was to grant write
temporarily and remember to take it back, which is a revocation that fails
silently.

</details>
