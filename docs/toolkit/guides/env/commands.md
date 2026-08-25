---
name: The commands
description: pull, push and audit — what each one touches, what the audit can and cannot compare, and the two rare paths.
order: 2
---

# The commands

```bash
pnpm devtools env pull  --target staging   # Bitwarden → .env.staging, in place
pnpm devtools env push  --target staging   # .env.staging → Bitwarden → GitHub
pnpm devtools env audit --target staging   # compare every store
```

`audit` reads only and is safe to run against anything. Read
[Env](/docs/toolkit/guides/env) first for what the stores are.

Leave `--target` off and it asks. The picker is ordered least- to
most-dangerous, so a reflexive Enter selects `preflight` and never `production`;
it refuses to prompt when stdin is not a terminal, because a prompt nobody can
answer hangs until the job times out. `--file` overrides the file a target
implies — an override for odd jobs, not the way to choose a target. `--yes`
skips the confirmations, and `push --target production --yes` is refused rather
than run unattended.

You need `gh auth login` with the `repo` scope and admin on the repository, and
a Secrets Manager access token — which the tool finds, or asks for once and
offers to save.

<details>
<summary>Where does the access token come from?</summary>

Four places, in order, stopping at the first hit: `--access-token`;
`BWS_ACCESS_TOKEN`, which includes your `.env`, since `with-env` loads it for
every command; your Bitwarden Password Manager vault, through the `bw` CLI that
ships as a devtools dependency (`pnpm bw login` once); and finally asking you —
masked, with an offer to save it to `.env` or to the vault as _"DevDogs Secrets
Manager access token (admin)"_.

Explicit beats ambient, so the flag wins over the environment: somebody passing
it while `BWS_ACCESS_TOKEN` is set is overriding on purpose, and quietly using
the environment instead would point the command at the account they were trying
to avoid. It is also the one source with a warning attached — a flag is visible
to `ps` and lands in shell history, and nothing else here puts the token in
argv. `BWS_ORG_ID` gets the same first-run prompt with no destination question;
it is a public identifier with one sensible home.

The road out of `.env` stays closed either way: `push` refuses
`BWS_ACCESS_TOKEN` and `AIRTABLE_PAT` **by name**, `pull` will not write them
back, and `audit` reports either one in any remote store as an error.

</details>

## `pull` edits the file in place

An env file is mostly commentary — which value breaks the Supabase CLI when
empty, which must stay commented out, why. So `pull` edits **lines**, not a
parsed map: untouched lines come back byte for byte, and every note stays where
its key is. Nothing is deleted; a key that should go away is commented out, and
setting a commented key revives that line rather than appending a second copy.

`pull --target production` warns first and its confirmation defaults to no —
anything that then loads `.env.production` is pointed at production.

## `push` writes both stores

Overwrites are confirmed separately from additions, so answering yes to "create
three new secrets" is not also answering yes to "replace a live credential", and
each GitHub environment is confirmed on its own. Secrets in the project and
absent from your file are reported and **never** removed. Committed defaults,
per-developer values and empty values are skipped.

Writes are paced about 1.1 seconds apart to stay under Bitwarden's published
rate limit; a push of more than five keys announces how long it expects to take,
because a minute of silence reads as a hang.

## What the audit compares

| Store                          | Exposes             | Checked for                  |
| ------------------------------ | ------------------- | ---------------------------- |
| the target's env file          | names and values    | value drift                  |
| Bitwarden                      | names and values    | value drift (the truth)      |
| GitHub secrets                 | names + `updatedAt` | presence, routing, staleness |
| GitHub variables               | names and values    | value drift, routing         |
| Cloudflare Workers             | names only          | orphans                      |
| the repository's own variables | names only          | shadowed copies              |

**That asymmetry is the whole design.** A GitHub secret is write-only, so a
clean audit does not mean "everything matches" — it means "nothing detectable is
wrong", and the closing summary says which is which rather than implying the
stronger claim. Any error sets a non-zero exit code.

The failure this whole design has is a rotation pushed to Bitwarden and never
propagated: production keeps authenticating with the old value, and everything
looks healthy until the old one is revoked. Names alone cannot catch it — both
stores have the key — so the audit compares each secret's Bitwarden
`revisionDate` against GitHub's `updatedAt`. It cannot ask "do these match?",
because nothing can; it asks "was GitHub updated after Bitwarden last changed?"

<details>
<summary>Every finding the audit can report</summary>

**Errors.** Your env file and Bitwarden disagree on a value — the only value
comparison a secret gets anywhere in this system. In Bitwarden, not on its
GitHub environment: the deploy cannot see it. In an environment it does not
belong in: an apply-tier credential sitting in `production` makes the reviewer
gate decorative, and presence alone calls that healthy. Rotated in Bitwarden
after GitHub was last updated. A key in the wrong GitHub _store_ — a public
value stored as a secret, or a secret stored as a variable, the second of which
means delete it and rotate. A never-store or deploy-minted credential found in
any store that must not hold it.

**Warnings.** In GitHub or on a Worker, not in Bitwarden — an orphan from a
rename, which matters because `wrangler deploy --secrets-file` preserves what it
omits and so leaves the secret on the Worker indefinitely. In your env file, not
in Bitwarden. In Bitwarden, missing from your file: you are about to push an
incomplete set. In your `.env` but declared in no manifest, so `push` skipped
it — the fix is a `define()` in the owning package's `env.ts`, not a push. And a
managed key that is **also** a repository-level GitHub variable: the environment
copy shadows it, so it is invisible and stale until somebody deletes that copy,
whereupon it silently becomes live. Delete it with `gh variable delete <NAME>` —
without `--env`, which would remove the managed copy instead.

Listing the repository's own variables needs permissions the environment reads
do not, so it can fail on its own. When it does the audit says **could not
check** and the closing summary withdraws the claim, rather than reporting
nothing found — a clean report that quietly skipped a check is indistinguishable
from a clean one that did not. An unknown or unparseable timestamp counts as
current, not stale, for the same reason: "unknown means behind" turns one
malformed date into a report that says everything is broken, after which nobody
reads any of it.

</details>

`env init` creates a file for a target. Re-running it on a `.env` that already
exists is **additive**, not a refusal: it appends only the keys the file does
not mention at all, under a dated header, and leaves every existing line
byte-for-byte — an active line holds somebody's value and a commented one holds
their decision. That is what makes the setup picker's "pick less now, come back
for more later" true. Every other target refuses instead, and points you at
`env pull` to update values in place.

`env example` regenerates `.env.example` from the manifests, as CI checks it;
`env reset` blanks every value in `.env` while keeping each one commented out
beside its blank line. `pnpm devtools env --help` lists all six.

## Rare paths

<details>
<summary>Rotating a secret</summary>

```bash
pnpm devtools env pull  --target production   # start from what is live
$EDITOR .env.production                       # change the one value
pnpm devtools env push  --target production   # → Bitwarden AND GitHub
pnpm devtools env audit --target production   # must report no drift
```

No `export` step: the access token is found for you. `push` does both stores in
one run, so the old two-step gap is gone — but the audit still earns its place,
because declining the GitHub half at its prompt leaves Bitwarden ahead, and the
tool says so at the time.

</details>

<details>
<summary>Break-glass: losing access to Secrets Manager</summary>

A lapsed subscription or a lost machine account locks you out of your own
deploys, and organization billing follows whoever was treasurer. Keep an export
of each project in the **Password Manager** vault, and re-export after any
rotation.

</details>
