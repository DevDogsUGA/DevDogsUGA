---
name: Airtable Base Setup
description: How the officer base is scaffolded, verified, and extended — the field registry that makes every push and pull one line, and the member identity data that has to exist in Postgres first.
---

# Airtable Base Setup

> **Status: built and scaffolded.** The base exists, the three scripts exist, and
> `registry.ts` holds real IDs pulled from it.
> [Meetings & Teams](./meetings-and-teams.md#where-meetings-come-from) decides
> _what_ syncs and in which direction; this page is _how the base gets built_,
> how a field is added later without touching five files, and what has to be true
> in Postgres before member data can be pushed at all.
>
> **API claims marked Confirmed were checked against Airtable's Web API reference
> on 2026-08-03.** Claims marked **Measured** were run against the real base on
> 2026-08-06 — and one of them contradicts the reference outright, so prefer a
> Measured note wherever the two disagree.
>
> What remains unproven is behaviour under load and how a specific plan enforces
> a documented limit. No sync has moved real member data yet.

## Two columns have to exist first

Pushing "legal name and UGA email" sounds like reading two columns. Neither
exists as such today, and the gap is not cosmetic.

### What is actually there

`platform.profile` carries `involvementFirstName`, `involvementLastName`, and
`involvementImportedAt`, populated by the UGA Involvement Network CSV import in
`server/actions/verification.ts`. That import parses `First Name`, `Last Name`,
and `Email`, matches on `auth.users.email`, and creates the auth user when no
match exists.

So the data has arrived at some point. It is stored in a shape that cannot be
pushed:

- **The UGA email is not distinguishable from an account email.** It lands in
  `auth.users.email` — the same column that holds a Gmail address for anyone who
  signed up with Google or Discord before appearing on a roster. There is no
  column that says "this address is institutional and verified", so a push
  keyed on it would key on whatever the member happened to sign up with.
- **The involvement name is deliberately transient.** The import opens with
  `update profiles set involvementFirstName = null, involvementLastName = null,
involvementImportedAt = null` across every row, then repopulates from the CSV.
  That is correct for what those columns are _for_ — they answer "is this person
  on the current roster", which is a verification signal that should go false
  when somebody drops off.

The second point is the one that would have caused a real bug. `involvement*` is
**not unchanging data**; it is current-roster data that nulls itself every
import. Pushing it to Airtable as "legal name" would blank the field for every
member who graduated, took a semester off, or was simply missing from one CSV —
and blanking a dues record's name is exactly the kind of silent damage the
push-only rules exist to prevent.

### The addition

> **Built** — migration `20260803000000_platform_profile_identity.sql`.

Durable identity gets its own columns, set once and never cleared:

```sql
alter table platform.profile
  add column "ugaEmail"          text,          -- the Airtable key; see below
  add column "legalFirstName"    text,
  add column "legalLastName"     text,
  add column "identitySourcedAt" timestamptz;   -- when the roster last confirmed it

alter table platform.profile
  add constraint "profile_ugaEmail_lowercase"
  check ("ugaEmail" is null or "ugaEmail" = lower("ugaEmail"));

create unique index "profile_ugaEmail_key" on platform.profile ("ugaEmail");
```

The Involvement import writes both sets: `involvement*` as it does now, plus
`ugaEmail` / `legal*` **without the clearing pass**. One import, two meanings,
and the distinction is worth stating in a comment on the migration because it
will otherwise look like duplication:

| Columns              | Question answered                | Cleared on import?  |
| -------------------- | -------------------------------- | ------------------- |
| `involvement*`       | Are they on the _current_ roster | **Yes** — by design |
| `legal*`, `ugaEmail` | Who is this person, durably      | Never               |

`ugaEmail` is case-folded because the import already lowercases and a case
mismatch would create a second member row for the same person. This was drafted
as `citext`, which says that directly; it shipped as a check constraint plus a
plain unique index instead, because `citext` is an extension type — under
Supabase's layout the column would be `extensions.citext` — and `drizzle-kit
pull` cannot render that into the generated schema. The guarantee is identical
and the generated column stays a plain `text`.

Because the check rejects a mixed-case address outright rather than folding it,
anything writing this column must lowercase first. The import already does.

#### Members cannot write their own identity

`platform.profile` is written straight from the browser through PostgREST — the
account page updates `preferredName`, `bio`, `pronouns`, `roleDescription` and
the `show*` flags that way — and its UPDATE policy is a permissive
`auth.uid() = "userId"`. That policy is about _which row_, not which columns, so
on its own it would let a member set their own `ugaEmail` and rewrite the
identity a dues record is keyed on.

Column-level grants are the fix, and they only work in one direction: a
`revoke update ("ugaEmail") …` against a table-wide UPDATE grant does nothing.
The table-wide grant has to go first, then come back per column — the same shape
migration `20260730000005` asserts for app schemas. `packages/sb/testing/rls.test.ts`
covers both sides.

### UGA email as the key, with one caveat

Using `ugaEmail` as the Members table's unique key is right, and it does **not**
contradict the rule elsewhere in these docs against matching on email. That rule
is about _account_ email, which a member can change to anything at any time. A
UGA address is institutionally assigned, unique by construction, and stable for
as long as somebody is enrolled — a different kind of value that happens to share
a shape.

The caveat is that stable is not immutable: a legal name change can be
accompanied by a MyID change, rarely but really. So **push the platform `userId`
as well**, into a locked `⚙️ Platform ID` field, and have the sync match on
_that_. `ugaEmail` is then a unique, human-meaningful column officers can filter
and cross-reference by, and a MyID change becomes a field update rather than a
duplicated member. One extra field buys the difference between a rename and a
broken join.

#### The API forces this, as it turns out

That recommendation was prudence when written. It is now a requirement, because
Airtable's upsert has a type restriction on what it can match on:

> `fieldsToMergeOn` takes "an array with at least one and at most three field
> names or IDs. These cannot be computed fields (formulas, lookups, rollups), and
> must be one of the following types: **number, text, long text, single select,
> multiple select, date**."

**`email` is not on that list.** A field typed `email` — which is what a column
holding `myid@uga.edu` should be, so officers get validation and a mailto
affordance — is not eligible as a merge key at all. The two ways out are typing
UGA email as `singleLineText` and losing that, or merging on something else.

Merging on `⚙️ Platform ID`, typed `singleLineText`, costs nothing and was
already the better answer. `ugaEmail` stays a real `email` field and does the job
it is actually good at: being the column an officer sorts, filters, and
recognizes people by.

The same restriction rules out merging on anything derived. `⚙️ Meetings
attended` could plausibly be a rollup one day; if it ever becomes one it silently
stops being usable as a merge key, which is a good reason for the registry's
`.matchKey()` to be declared on exactly one field and checked by `verify.ts`
against the live field type.

## The field registry

Everything the sync reads or writes is declared in one place. This is what makes
"we may want to push something else later" a one-line change rather than an
archaeology exercise across `sync.ts`, `push.ts`, and three type definitions.

```ts
// packages/airtable/src/registry.ts
export const members = table("Members", "tblMembersXXXXXX", {
  // .text() emits "singleLineText" — the only merge-key-eligible text type.
  platformId: field
    .text("fldAAAAAAAAAAAAAA")
    .matchKey()
    .push((m) => m.userId),
  // .email() emits "email", which CANNOT be a merge key. See above.
  ugaEmail: field.email("fldBBBBBBBBBBBBBB").push((m) => m.ugaEmail),
  legalName: field
    .text("fldCCCCCCCCCCCCCC")
    .push((m) => [m.legalFirstName, m.legalLastName].filter(Boolean).join(" ")),
  meetingsAttended: field
    .number("fldDDDDDDDDDDDDDD")
    .push((m) => m.meetingCount),

  duesPaidAt: field.date("fldEEEEEEEEEEEEEE").pull((v) => ({ duesPaidAt: v })),
  notes: field.longText("fldFFFFFFFFFFFFFF").ignore(),
});
```

Four properties, each doing real work:

### Direction is per field, and the type enforces it

`.push()` and `.pull()` are mutually exclusive in the type. A field declared with
both fails to compile; a field declared with neither must say `.ignore()` out
loud.

That turns the rule the whole integration rests on —
[never create a field that both sides write](./meetings-and-teams.md#what-flows-back-to-airtable)
— from a convention somebody has to remember into a compile error. It is the
single highest-value thing in this design, because a second writer produces no
error at runtime: it produces last-writer-wins, silently, weeks later.

`.ignore()` exists so that an officer-authored field the platform does not touch
is _declared_ as untouched rather than merely absent. The difference matters when
somebody later asks "does the sync know about Notes?" — absent means nobody
looked, `.ignore()` means somebody decided.

### Field **IDs** are the wire format

`fldAAAAAAAAAAAAAA`, not `"Legal name"`.

This is the same reasoning as `airtableRecordId` for rows, applied one level
down. Airtable field names are editable by anyone with base access, and an
officer tidying "UGA email" to "UGA Email" would silently break a name-keyed
push — the API would accept the write and create nothing, or reject it as an
unknown field, depending on the endpoint. Field IDs never change.

Reads pass `returnFieldsByFieldId=true` so responses come back keyed the same
way. The human-readable name stays in the registry as the first argument to
`table()` and in a comment, because it is what an officer will say when they
report a problem.

**Confirmed.** `returnFieldsByFieldId` is a documented boolean on list-records —
_"lets you return field objects where the key is the field id… defaults to false,
which returns field objects where the key is the field name."_ On the write side
Airtable states that IDs and names are **interchangeable in request bodies**, so
a create or update can key its `fields` object by ID and needs no change when
somebody renames a column.

Note the asymmetry that makes this easy to get wrong: `returnFieldsByFieldId` is
**response-only**. It does not make a request body ID-keyed — that is simply
allowed. So a client that sets the flag and then writes by name will read one way
and write the other, and only notice on the first rename.

### One registry, three consumers

The push builder, the pull parser, and the verify script all read the same
declarations. Adding `graduationYear` to the push is:

1. Add one line to the registry with the new field ID.
2. Nothing else.

The batching, change-detection, and `⚙️` prefix conventions are properties of the
sync engine, not of any particular field, so a new field inherits them.

### Change detection lives in the engine

The push skips records whose mapped values are unchanged since the last pass —
[a sync that rewrites identical values burns the shared allowance and makes every
record look freshly modified](./meetings-and-teams.md#what-flows-back-to-airtable).
Because the registry knows how to project a row to its Airtable representation,
the engine can hash that projection and compare, rather than each field having to
implement its own dirty check.

## Scaffolding the base

The base is created by script, not by clicking. Not because clicking is hard, but
because a base built by hand has no record of how it was built, and the second
one — a staging base, or a rebuild after somebody deletes a table — is a
different base with the same name.

```
scripts/airtable/
  scaffold.ts     create tables and fields from the registry's declared shape
  verify.ts       diff the live base against the registry; exit non-zero on drift
  pull-ids.ts     write discovered field IDs back into registry.ts
  client.ts       the shared client -- environment only, never Vault
```

Run them as `pnpm airtable:scaffold`, `pnpm airtable:pull-ids` and
`pnpm airtable:verify`. `scaffold` takes `--dry-run`, which reports the diff
without writing; it is worth using first, because the first real run is against
a base somebody cares about.

They read `AIRTABLE_PAT` from the environment rather than from Vault, which is
the opposite of every other credential here and deliberate: these run _before_
the platform is configured, they need `schema.bases:write` — a scope the sync
token should not carry — and the person running them has the token in hand.

The bootstrapping order is the awkward part, and it is worth spelling out because
it looks circular:

1. `scaffold.ts` reads a **shape** declaration — table names, field names, field
   types — which is the registry with the IDs left blank.
2. It creates what is missing, via the Meta API
   (`POST /v0/meta/bases/{baseId}/tables`, then `.../fields`).
3. It reads the base schema back and **prints the field IDs**.
4. `pull-ids.ts` writes them into `registry.ts`, which is committed.

After that first run the IDs are source, and `scaffold.ts` becomes an idempotent
"create anything missing" operation. Adding a field later is the same two steps:
declare it with a `todo("slug")` ID, scaffold, pull-ids.

Tables are created in one pass and **links in a second**, after every target
table has an ID. Ordering the tables by dependency would work today and break
the first time two tables link to each other; two passes cannot.

> **Measured, and it contradicts the reference.** Creating a
> `multipleRecordLinks` field accepts `linkedTableId` and **nothing else**. The
> published field model lists `prefersSingleRecordLink` as _required_ and does
> not mention `isReversed` at all; in practice every request carrying either key
> is rejected:
>
> | Options sent                                             | Result |
> | -------------------------------------------------------- | ------ |
> | `{ linkedTableId }`                                      | `200`  |
> | `{ linkedTableId, prefersSingleRecordLink }`             | `422`  |
> | `{ linkedTableId, isReversed }`                          | `422`  |
> | `{ linkedTableId, prefersSingleRecordLink, isReversed }` | `422`  |
>
> They are response-only: the create returns both, unasked. The cost is that
> officers get a multi-record picker rather than a single-record one — cosmetic,
> since every pull parser reads `v[0]`, but it is on the manual checklist below.

**Confirmed, with a prerequisite.** `POST /v0/meta/bases` is documented as
**"Billing plans: All plans"**, so Team qualifies and no empty base has to be
made by hand. It needs `schema.bases:write` **and the caller must hold the
workspace creator role** — a person-level permission, not a token scope, so a
token minted by an officer who is merely a workspace collaborator will fail here
while succeeding at everything else. Mint the scaffolding token as whoever
created the workspace.

### What the scripts cannot do

Some of the base is not API-addressable, so it goes in a checklist that
`verify.ts` cannot enforce. Keeping the list short and explicit is the point:

| Task                                              | Why by hand                                  |
| ------------------------------------------------- | -------------------------------------------- |
| **Field editing permissions** on every `⚙️` field | A paid-plan UI feature with no public API    |
| **The `/airtable/sync` button field**             | Button fields with a URL are UI-configured   |
| Deleting Airtable's default `Table 1`             | The Meta API has no table DELETE             |
| Setting links to a single-record picker           | Rejected at creation — see the Measured note |
| Grid views, filters, groupings                    | Officer preference, deliberately not managed |
| Workspace and collaborator setup                  | Account-level, outside the base              |

Field editing permissions being manual is the uncomfortable one, because they are
what stops an officer overwriting a pushed value. `verify.ts` should at least
_report_ which fields are marked `.push()` so the list can be checked against the
UI, even though it cannot read the permission state.

**Confirmed negative.** The base schema response is purely structural — per
field it returns `id`, `name`, `type`, an optional `description`, and
type-specific `options`, and per table `id`, `name`, `description`,
`primaryFieldId`, `fields`, and `views`. There is **no permission or
editing-restriction data anywhere in it.**

So this row cannot move up, and `verify.ts` cannot ever confirm the lock-down is
in place. The best it can do is print every `.push()` field as a checklist for a
human to walk the UI against — which is worth doing precisely because it is the
one protection nothing can verify for us.

## Verifying the base

`verify.ts` fetches the base schema and compares it against the registry. It runs
in three places:

- **`pnpm airtable:verify`**, by hand, as step 7 of the runbook.
- **CI**, in the `airtable` job, whenever `@devdogsuga/airtable` is affected. It
  skips itself when the secrets are absent, so a fork can still run CI, and it
  passes `--no-duplicates` — duplicate match keys are a property of the _data_,
  which changes with no commit, and a build nobody's PR can fix is a build people
  learn to ignore.
- **Before every sync pass**, inside `runAirtableSync`, ahead of the lease claim.

That last one is the important one, and it was missing until 2026-08-06: the
verifier existed and nothing called it. A registry ID that is not in the base is
not an error at write time — Airtable accepts the request, the value lands
nowhere, and the pass reports success. So the one failure mode the verifier was
built for was the one still unguarded, and it costs a single schema read out of
roughly seven requests a pass to close.

Five checks, in order of how badly each fails:

| Check                                     | On failure                                                         |
| ----------------------------------------- | ------------------------------------------------------------------ |
| Every registered field ID exists          | **Fatal** — the sync would write into nothing                      |
| Field types match the registry            | **Fatal** — a text field where a date is expected coerces silently |
| The `.matchKey()` field is merge-eligible | **Fatal** — upsert rejects `email`, computed, and other types      |
| Every `.matchKey()` field is unique-ish   | **Warn** — Airtable cannot enforce uniqueness on most field types  |
| Live fields absent from the registry      | **Report** — officers may add their own; just list them            |

The third is what the API documentation makes necessary rather than prudent:
`fieldsToMergeOn` accepts only number, text, long text, single/multiple select,
and date, so a merge key that drifts to `email` or becomes a rollup fails at
write time instead of at deploy time.

The fourth deserves explaining. Airtable does not enforce uniqueness on a text or
email field, so `ugaEmail` being the key is a convention the base cannot uphold
by itself. `verify.ts` should scan for duplicates and report them, because two
Members rows with the same UGA email is the failure that produces a member whose
attendance count is split across two records and whose dues look unpaid.

The fifth is a report rather than an error on purpose. The base is the officer
console; officers adding a column for their own tracking is the system working.
Listing them just means nobody assumes a hand-added column syncs anywhere.

## The member push

Member data is **push-only**, with one pulled field. It is the newest part of the
integration and the one carrying the most identifying data, so the rules are
tighter than elsewhere.

| Field                  | Direction | Source                                     |
| ---------------------- | --------- | ------------------------------------------ |
| `⚙️ Platform ID`       | push      | `profile.userId` — the match key           |
| `UGA email`            | push      | `profile.ugaEmail`                         |
| `Legal name`           | push      | `profile.legalFirstName` + `legalLastName` |
| `⚙️ Meetings attended` | push      | Derived from `attendance`                  |
| `Dues paid`            | **pull**  | Officer-authored                           |

Three constraints on top of the general rules:

- **Push only members who have a `ugaEmail`.** Somebody who signed up with a
  personal Google account and has never appeared on an Involvement roster has no
  institutional identity to record, and inventing a Members row for them keyed on
  a Gmail address defeats the key. They appear once the next roster import
  matches them.
- **Never blank a pushed identity field.** If `ugaEmail` or `legal*` is null in
  Postgres for a row that already exists in Airtable, skip the field rather than
  writing an empty value. Null here means "we have not learned it", never "it is
  empty", and the distinction is invisible once written.
- **Nothing from the profile proper.** `preferredName`, `pronouns`, `bio`,
  `graduationYear`, and the social links stay in Postgres. They are member-authored
  and mutable, which is the opposite of what this table is for — and
  [the stars export](./meetings-and-teams.md#starscsv--one-file-all-meetings)
  already covers the case where somebody needs them.

The reason the last rule is worth writing down: the registry makes adding a field
one line, which is exactly why the boundary needs to be stated somewhere other
than in the difficulty of the change.

## Configuration

> **Built** — `packages/airtable`, `apps/platform/src/server/airtable/credentials.ts`.
> Scaffolded against the live base on 2026-08-06.

Everything the integration needs to be pointed at a base, in one place.

### Environment variables

| Variable           | Where       | Required           | What it is                                               |
| ------------------ | ----------- | ------------------ | -------------------------------------------------------- |
| `AIRTABLE_BASE_ID` | root `.env` | Only to run a sync | `appXXXXXXXXXXXXXX` — which base to talk to              |
| `AIRTABLE_PAT`     | root `.env` | Bootstrap only     | The token, **before** Vault has one. Remove once stored. |

`AIRTABLE_BASE_ID` defaults to `""` rather than being required. The platform has
to boot without Airtable configured — the base is provisioned separately, and a
required variable would mean the whole app refuses to start until somebody
finishes a task in a different system. The sync refuses with a named
`AirtableNotConfiguredError` instead, which the console can render as
"Airtable is not configured" rather than surfacing a 401 from a vendor.

### The token lives in Vault

|             |                                                                                     |
| ----------- | ----------------------------------------------------------------------------------- |
| Secret name | `airtable_pat`                                                                      |
| Stored via  | `storeVaultSecret(token, "airtable_pat")` — the same path as every other credential |
| Read via    | `getAirtableToken()` in `server/airtable/credentials.ts`                            |

Looked up by **name**, not by a secret id kept in an env var. Vault names are
unique, so the name is a stable handle that survives rotation — replacing the
value changes nothing else. A stored id would mean a rotation that creates a new
row silently leaves the sync reading the old one.

`AIRTABLE_PAT` is checked **second**, deliberately. Once the Vault entry exists a
stale environment variable cannot quietly take precedence over the rotated token.

### Token scopes

Mint one token, scoped to the club workspace only:

- `schema.bases:read` — `verify.ts`
- `schema.bases:write` — `scaffold.ts`
- `data.records:read` — the pull half of every sync
- `data.records:write` — the push half, and the member push

**Mint it as whoever created the workspace.** `POST /v0/meta/bases` requires the
workspace _creator_ role, which is a person-level permission a token inherits and
no scope can grant. A collaborator's token does everything else and fails only at
scaffolding, which is a confusing place to discover it.

### Turning it on, once the base exists

1. Set `AIRTABLE_BASE_ID` and `AIRTABLE_PAT` in the root `.env`.
2. `pnpm airtable:scaffold --dry-run` — report what would be created.
3. `pnpm airtable:scaffold` — create it.
4. `pnpm airtable:pull-ids` — write the discovered IDs into `registry.ts`, then
   `pnpm prettier --write` it and commit.
5. Walk the manual checklist `verify.ts` prints (field editing permissions).
6. `pnpm airtable:verify` — must exit clean.
7. Store the token in Vault as `airtable_pat` and **remove `AIRTABLE_PAT` from
   `.env`**. Vault is checked first, but a `null` from a failed read is
   indistinguishable from "nothing stored", so a lingering env var wins by
   accident. It is what silently inverted this precedence before 2026-08-06.
8. Grant an officer role `canTriggerSync` and run one pass from the console.

Steps 3 and 4 are what replace the placeholder IDs the registry ships with.
Until they run, `verify.ts` fails every table with "ID is still a placeholder" —
which is deliberate, because a placeholder that reaches a live sync does not
error. Airtable accepts the request, the write lands nowhere, and the pass
reports success.

### What the registry ships with

`packages/airtable/src/registry.ts` declares six tables — Members, Projects,
Meetings, Workshops, Competitions, Teams — 37 fields, all now holding real IDs
pulled from the live base. A newly declared field carries a `fldTODO_*`
placeholder until `scaffold` and `pull-ids` have run for it.

Adding a field later is one line in that file. Direction (`.push()` / `.pull()` /
`.ignore()`) is mutually exclusive **in the type**, so a field both sides write
fails to compile rather than producing last-writer-wins weeks later.

## Runbook

Ordered, because several steps fail confusingly when done out of order.

1. **Create the workspace.** A separate workspace from any other club Airtable
   use, so the sync's call budget is not shared with project management. See the
   [allowance note](./meetings-and-teams.md#where-meetings-come-from).
2. **Create a personal access token** scoped to that workspace with
   `schema.bases:read`, `schema.bases:write`, `data.records:read`, and
   `data.records:write`. Write is needed for scaffolding and for the pushes.

   **Mint it as whoever created the workspace.** `POST /v0/meta/bases` requires
   the workspace _creator_ role, which is a person-level permission the token
   inherits and cannot be granted by scope. A token from a collaborator will do
   everything else and fail only at step 4, which is a confusing place to
   discover it.

3. **Put the token in `.env` as `AIRTABLE_PAT`** for the scaffolding run. It
   moves to Vault at step 8, once there is a base to point at.
4. **Run `pnpm airtable:scaffold`.** Creates the six tables and their fields.
   `--dry-run` first reports the diff without writing.
5. **Run `pnpm airtable:pull-ids`**, format, and commit the resulting
   `registry.ts`.
6. **Do the manual checklist** above — field editing permissions first, since
   they are the security-relevant one. Airtable's default `Table 1` is deleted
   here too; the Meta API cannot.
7. **Run `pnpm airtable:verify`.** It should exit clean. If it does not, fix the
   base rather than the registry: the registry is what the code agrees with.
8. **Seed Projects** by running one sync pass. Projects are platform-owned and
   pushed, so the table populates itself and officers get a linked-record list
   they can select from immediately.
9. **Only then** author a meeting. Doing it earlier produces a workshop linked to
   nothing.
10. **Move the token to Vault** as `airtable_pat` and delete `AIRTABLE_PAT` from
    `.env`. Last rather than first: the scaffolding scripts read the environment
    by design, and a token that is only in Vault cannot scaffold anything.

## Tests

> **Built** — 50 tests in `packages/airtable/src/*.test.ts`, plus 5 in
> `apps/platform/src/server/airtable/run.test.ts` for the schema precondition.
> Every test drives a stub client, so the wire format is asserted against the
> documented API shapes rather than against Airtable's actual responses — which
> is exactly how the `multipleRecordLinks` options above went undetected until
> the scaffolder ran for real. The first sync of real member data is still the
> first real proof.

- **Registry/base agreement** — `verify.ts` against a fixture base, asserting
  each of the four checks fires on a deliberately broken schema. The renamed-field
  case matters most, since it is the one field IDs exist to survive. ✅ — plus a
  fifth case, the officer's own column, asserted to be a report rather than an
  error.
- **Direction exclusivity is a type error** — a `.push().pull()` field must fail
  to compile. Assert with a type-level test rather than a runtime one; the whole
  value is that it never runs. ✅ — `@ts-expect-error` on both directions, plus
  the same guard on `.matchKey()` against an ineligible field type.
- **Identity is never blanked** — a member whose `ugaEmail` goes null in Postgres
  must leave the Airtable value untouched, not clear it. ✅
- **Duplicate key detection** — two Members rows sharing a UGA email are
  reported, since Airtable will not catch it. ✅
- **The Involvement import writes both column sets** — `involvement*` cleared and
  repopulated, `legal*` and `ugaEmail` populated and **not** cleared for a member
  absent from the new CSV. This is the regression that the two-column split
  exists to prevent, so it is the test that justifies the split. ✅ — verified
  against the local database by driving the import's actual statements in
  order. Not yet a standing test: `uploadVerificationCSV` takes a session and a
  permission check, so it needs either a fixture harness or the action's core
  extracted from its guards.

The scaffolder's own, added because "it worked once, by hand, against one base"
is indistinguishable from "it works":

- **Links are created only after their target table exists.** Asserted on call
  ORDER, not on the result — a scaffolder that gets this right by accident passes
  a result check and fails the moment a table is added above it in the registry.
  ✅
- **`⚙️ Platform ID` ends up the primary field** in all six tables. Airtable takes
  the first field in the array as primary and refuses links and checkboxes there,
  so this is a property of argument order that nothing else would catch. ✅
- **A second run does nothing**, and dropping one field makes the next run create
  exactly that field. ✅
- **A renamed field is not recreated** when the registry holds its ID — surviving
  a rename being the entire reason the wire format is IDs. ✅
- **The sync refuses a base that does not match**, claiming no lease and issuing
  no write. ✅ Negative-controlled: deleting the precondition fails three of
  these.

Three the design note did not list, added because building the engine surfaced
them:

- **Change detection treats an absent field and an empty value as one state.**
  Airtable omits empty fields from responses rather than returning null, so
  without this every record with one empty field looks changed on every pass,
  forever — burning the shared call allowance and destroying "sort by last
  modified" as a way to find what an officer actually touched.
- **Batching at exactly 10.** Not a tunable: exceeding it is a 422.
- **Backoff on 429 but not on 422.** The 5 requests/second per-base limit is
  universal and does not lift with the plan, so retrying a rate limit is
  required at every tier — and retrying a malformed request never helps.

## See also

- [Meetings & Teams](./meetings-and-teams.md#where-meetings-come-from) — what
  syncs, in which direction, and the rules that protect attendance.
- [Elections](./elections.md#who-does-what-and-where) — the election
  configuration officers author in the same base.
