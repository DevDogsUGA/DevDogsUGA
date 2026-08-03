---
name: Airtable Base Setup
description: How the officer base is scaffolded, verified, and extended — the field registry that makes every push and pull one line, and the member identity data that has to exist in Postgres first.
---

# Airtable Base Setup

> **Status: designed, not built.** The base does not exist yet and neither do the
> scripts. [Meetings & Teams](./meetings-and-teams.md#where-meetings-come-from)
> decides _what_ syncs and in which direction; this page is _how the base gets
> built_, how a field is added later without touching five files, and what has to
> be true in Postgres before member data can be pushed at all.
>
> **API claims here were checked against Airtable's Web API reference on
> 2026-08-03** and are marked **Confirmed** where they were. They are still
> documentation rather than a spike: nothing has been run against a real base, so
> anything about behaviour under load, or about how a specific plan actually
> enforces a documented limit, remains unproven.

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

Durable identity gets its own columns, set once and never cleared:

```sql
alter table platform.profile
  add column "ugaEmail"        citext unique,   -- the Airtable key; see below
  add column "legalFirstName"  text,
  add column "legalLastName"   text,
  add column "identitySourcedAt" timestamptz;   -- when the roster last confirmed it
```

The Involvement import writes both sets: `involvement*` as it does now, plus
`ugaEmail` / `legal*` **without the clearing pass**. One import, two meanings,
and the distinction is worth stating in a comment on the migration because it
will otherwise look like duplication:

| Columns              | Question answered                | Cleared on import?  |
| -------------------- | -------------------------------- | ------------------- |
| `involvement*`       | Are they on the _current_ roster | **Yes** — by design |
| `legal*`, `ugaEmail` | Who is this person, durably      | Never               |

`citext` for `ugaEmail` because the import already lowercases and a case
mismatch would create a second member row for the same person.

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
```

The bootstrapping order is the awkward part, and it is worth spelling out because
it looks circular:

1. `scaffold.ts` reads a **shape** declaration — table names, field names, field
   types — which is the registry with the IDs left blank.
2. It creates what is missing, via the Meta API
   (`POST /v0/meta/bases/{baseId}/tables`, then `.../fields`).
3. It reads the base schema back and **prints the field IDs**.
4. `pull-ids.ts` writes them into `registry.ts`, which is committed.

After that first run the IDs are source, and `scaffold.ts` becomes an idempotent
"create anything missing" operation.

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
| **The `/api/airtable/sync` button field**         | Button fields with a URL are UI-configured   |
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
in CI and before any sync in a fresh environment.

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

3. **Store the token in Vault** via `storeVaultSecret`, the same path as every
   other credential. It never lands in `.env`.
4. **Run `scaffold.ts`.** Creates the six tables and their fields.
5. **Run `pull-ids.ts`** and commit the resulting `registry.ts`.
6. **Do the manual checklist** above — field editing permissions first, since
   they are the security-relevant one.
7. **Run `verify.ts`.** It should exit clean. If it does not, fix the base rather
   than the registry: the registry is what the code agrees with.
8. **Seed Projects** by running one sync pass. Projects are platform-owned and
   pushed, so the table populates itself and officers get a linked-record list
   they can select from immediately.
9. **Only then** author a meeting. Doing it earlier produces a workshop linked to
   nothing.

## Tests

- **Registry/base agreement** — `verify.ts` against a fixture base, asserting
  each of the four checks fires on a deliberately broken schema. The renamed-field
  case matters most, since it is the one field IDs exist to survive.
- **Direction exclusivity is a type error** — a `.push().pull()` field must fail
  to compile. Assert with a type-level test rather than a runtime one; the whole
  value is that it never runs.
- **Identity is never blanked** — a member whose `ugaEmail` goes null in Postgres
  must leave the Airtable value untouched, not clear it.
- **Duplicate key detection** — two Members rows sharing a UGA email are
  reported, since Airtable will not catch it.
- **The Involvement import writes both column sets** — `involvement*` cleared and
  repopulated, `legal*` and `ugaEmail` populated and **not** cleared for a member
  absent from the new CSV. This is the regression that the two-column split
  exists to prevent, so it is the test that justifies the split.

## See also

- [Meetings & Teams](./meetings-and-teams.md#where-meetings-come-from) — what
  syncs, in which direction, and the rules that protect attendance.
- [Elections](./elections.md#who-does-what-and-where) — the election
  configuration officers author in the same base.
