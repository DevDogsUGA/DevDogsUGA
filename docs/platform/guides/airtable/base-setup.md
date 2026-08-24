---
name: Base setup
description: The identity columns Postgres needs before member data can move, the scripts that build and check the base, and the two tokens that must stay separate.
order: 2
---

# Base setup

The base is created by script, not by clicking: a base built by hand has no record of how it was built. This page is what those scripts do, what they cannot do, and what has to exist in Postgres first. Read it when standing a base up, adding a field, or working out why `airtable:verify` is red. For the ordered steps use the [Runbook](/docs/platform/guides/airtable/runbook); for exported functions, the generated [`@devdogsuga/airtable`](/docs/toolkit/reference/api/airtable) reference.

## Two columns have to exist first

Pushing "legal name and UGA email" sounds like reading two columns. Neither existed until migration `20260803000000_platform_profile_identity.sql`, which adds durable identity to `platform.profile`: `ugaEmail`, `legalFirstName`, `legalLastName`, and `identitySourcedAt`, written by the UGA Involvement Network CSV import and never cleared. `ugaEmail` carries a lowercase check constraint plus a `profile_ugaEmail_key` unique index.

<details>
<summary>Why can't the existing <code>involvement*</code> columns be pushed instead?</summary>

`platform.profile` already carries `involvementFirstName`, `involvementLastName`, and `involvementImportedAt`, populated by the same CSV import in `server/actions/verification.ts`. Two things make them the wrong source.

**The UGA email is not distinguishable from an account email.** It lands in `auth.users.email` — the same column that holds a Gmail address for anyone who signed up with Google or Discord before appearing on a roster.

**The involvement name is deliberately transient.** The import nulls all three columns across every row and repopulates from the CSV, because they answer "is this person on the _current_ roster". That is correct for a verification signal and wrong for identity: pushing it as a legal name would blank the field for every member who graduated, took a semester off, or was simply missing from one CSV — and blanking a dues record's name is exactly the silent damage the push-only rules exist to prevent.

`ugaEmail` was drafted as `citext`, which says the case rule directly. It shipped as a check constraint plus a plain unique index because an extension type cannot be rendered into the generated Drizzle schema; the guarantee is identical, and anything writing the column has to lowercase first.

</details>

⚠️ **Members must not be able to write their own identity.** `platform.profile` is updated straight from the browser through PostgREST under a permissive `auth.uid() = "userId"` policy, which is about _which row_ and not which columns. The migration revokes the table-wide UPDATE grant and re-grants column by column — the only order that works, since a column-level revoke against a table-wide grant does nothing at all.

## UGA email is the key officers read, not the one the sync merges on

The match key is `⚙️ Platform ID`, a `singleLineText` field holding `profile.userId`. `ugaEmail` stays a real `email` field and does the job it is good at: being the column an officer sorts, filters, and recognises people by.

<details>
<summary>Why not merge on the UGA email, which is unique already?</summary>

Two reasons that happen to agree.

**Stable is not immutable.** A UGA address is institutionally assigned and lasts as long as enrolment does, but a legal name change can carry a MyID change with it — rarely, but really. Matching on the platform `userId` makes that a field update rather than a duplicated member.

**The API forbids it outright.** `fieldsToMergeOn` takes "at least one and at most three field names or IDs… must be one of the following types: number, text, long text, single select, multiple select, date." `email` is not on that list. The ways out were typing the column as `singleLineText` and losing Airtable's validation and mailto affordance, or merging on something else — and something else was already the better answer.

The same restriction rules out merging on anything computed. `⚙️ Meetings attended` could plausibly become a rollup one day, at which point it would silently stop being merge-eligible, which is why `.matchKey()` is declared on exactly one field per table and checked against the live field type.

</details>

## The scripts

`packages/airtable/src` holds everything that decides anything — `scaffold.ts` creates what is missing, `verify.ts` diffs live against registry, `ids.ts` rewrites `todo("slug")` placeholders with real IDs, `snapshot.ts` refreshes or checks the committed schema snapshot. `packages/devtools/src/airtable` holds only prompting, file I/O, and exit codes. Run them as `pnpm airtable:scaffold` (which takes `--dry-run`), `pnpm airtable:pull-ids`, `pnpm airtable:verify`, and `pnpm airtable:snapshot`.

Scaffolding is idempotent — everything it does is "create what is missing" — and runs in **two passes**: tables and their non-link fields first, links second, once every target table has an ID. Ordering tables by dependency would break the first time two of them link to each other.

⚠️ **A `fldTODO_*` placeholder is fatal to `verify`, deliberately.** A placeholder reaching a live sync does not error: Airtable accepts the request, the write lands nowhere, and the pass reports success. `scaffold` then `pull-ids` are what replace them.

## Verifying the base

`verify.ts` runs in three places — by hand, in CI as the credential-free `pnpm airtable:snapshot:check`, and inside `runAirtableSync` **before the lease is claimed**, where a fatal finding refuses the whole pass with `schema_invalid` rather than writing into a shape it does not recognise.

<details>
<summary>What are the six checks, and how badly does each fail?</summary>

| Check                                      | On failure                                                          |
| ------------------------------------------ | ------------------------------------------------------------------- |
| Every registered field ID exists           | **Fatal** — the sync would write into nothing                       |
| Field types match the registry             | **Fatal** — a text field where a date is expected coerces silently  |
| The `.matchKey()` field is merge-eligible  | **Fatal** — upsert rejects `email`, computed, and other types       |
| Declared select choices match the base     | **Fatal** — a value the page cannot render is worse than no value   |
| Match keys are unique-ish                  | **Warn** — Airtable cannot enforce uniqueness on most field types   |
| Live fields absent from the registry       | **Report** — officers may add their own; just list them             |

The numbers in the source are stable identities rather than a ranking, which is why the fatal choice check is numbered last: renumbering would quietly repoint every comment and test name that says "check 4" at a different check.

The duplicate check is a warning because Airtable does not enforce uniqueness on a text or email field, so a unique match key is a convention the base cannot uphold by itself — and two Members rows sharing one is the failure that splits a member's attendance across two records and makes their dues look unpaid. The sync's own pre-flight runs with duplicate checking off, since it re-reads every record the pass is about to fetch anyway — costing one schema read out of roughly seven requests a pass.

</details>

## What the scripts cannot do

| Task                                              | Why by hand                                  |
| ------------------------------------------------- | -------------------------------------------- |
| **Field editing permissions** on every `⚙️` field | A paid-plan UI feature with no public API    |
| Deleting Airtable's default `Table 1`             | The Meta API has no table DELETE             |
| Setting links to a single-record picker           | Rejected at creation with a 422              |
| Grid views, filters, groupings                    | Officer preference, deliberately not managed |
| Workspace and collaborator setup                  | Account-level, outside the base              |

The first row is the uncomfortable one: those permissions are what stop an officer overwriting a pushed value, and the base schema response is purely structural, so nothing can ever confirm the lock-down. `formatVerifyResult` prints every `.push()` field as a checklist for a human to walk the UI against.

## Two tokens, never one

The base is shaped by a person holding a write-capable token and synced at run time by one that cannot reshape anything. Merging them would hand the cron job — and anything that can read the Worker's environment — the ability to drop a field from a base officers use daily.

<details>
<summary>Which token carries which scopes, and where does each live?</summary>

| Token           | Scopes                                                          | Lives in                                   | Used by                            |
| --------------- | --------------------------------------------------------------- | ------------------------------------------ | ---------------------------------- |
| **Sync**        | `schema.bases:read` · `data.records:read` · `data.records:write` | `AIRTABLE_SYNC_PAT`, the env registry      | the runtime sync, every pass       |
| **Scaffolding** | the same, **plus `schema.bases:write`**                          | `AIRTABLE_PAT` in your `.env`, transiently | `scaffold` · `pull-ids` · `verify` |
| **Plan**        | `schema.bases:read` **only**                                     | `AIRTABLE_PLAN_PAT`, CI environments       | `deploy airtable-plan`             |
| **Apply**       | the scaffolding scopes                                           | `AIRTABLE_APPLY_PAT`, behind reviewers     | `deploy airtable-apply`            |

The two axes are independent in Airtable: a records read/write token cannot alter tables or fields, whatever it does to rows. That independence is the whole reason a compromised runtime cannot rebuild the base, and it costs one extra token to keep.

**Which token a command picks is a function of what it does**, not of what is set. `airtableClient({ need })` walks a preference list per capability: `read` tries `AIRTABLE_PLAN_PAT` then `AIRTABLE_PAT`; `write` tries `AIRTABLE_APPLY_PAT` then `AIRTABLE_PAT`. Narrowest first, deliberately — an operator at a terminal usually holds the full scaffolding token, which satisfies both rows, so an unordered lookup would authenticate every dry run with a token that can restructure the base. Neither row crosses the split: a plan quietly running on the write token would make the reviewer gate decorative, and a write falling back to the plan token would turn a missing credential into a 403 halfway through a schema change.

⚠️ **On a machine holding both `AIRTABLE_PLAN_PAT` and `AIRTABLE_PAT`, a verify with duplicate checking will 403.** Duplicate detection reads _records_, and the plan token has no `data.records:read`. Keep `AIRTABLE_PLAN_PAT` out of your `.env` — it is a CI credential.

⚠️ **Mint the scaffolding token as whoever created the workspace.** `POST /v0/meta/bases` requires the workspace creator role, a person-level permission a token inherits and no scope can grant. A collaborator's token does everything else and fails only at base creation.

`AIRTABLE_BASE_ID`, and how each of these variables is routed to its target, live in [Env](/docs/platform/env).

</details>
