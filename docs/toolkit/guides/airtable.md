---
name: airtable
description: The field registry, the push and pull builders that read it, and the verifier that diffs the live base against it.
order: 7
---

# airtable

`@devdogsuga/airtable` is the officers' base as code: one registry of tables and
fields, a sync engine that reads it, and a verifier that diffs the live base
against it. It schedules nothing and looks up no credential — `AirtableClient`
takes its base id and token as arguments, and the callers are the platform's
sync and `pnpm devtools airtable`.

Three things you will actually reach for:

- **`registry`** — the declarations. Adding a field to the sync is one line
  there and nothing else; batching, change detection and the naming conventions
  are properties of the engine, so a new field inherits them.
- **`buildPush(spec, rows, existing)`** and
  **`applyPull(spec, records)`** — the two halves of a pass. The first returns
  the records to send plus what it skipped and why; the second parses records
  into the shape the sync writes to Postgres. `buildUpdate` is the same as
  `buildPush` for rows already linked to a record id.
- **`verifyBase(client, options)`** — reads only, and the thing to run first
  when a pass misbehaves.

Every read and write goes over the wire with field **ids**, not names, which is
what lets an officer rename a column without breaking anything. Ids are written
into `registry.ts` by `pnpm devtools airtable pull-ids` after
`pnpm devtools airtable scaffold` has created the field; a declaration still
carrying a `todo()` placeholder makes `verify` fail rather than warn, because a
placeholder that reaches a live sync writes into nothing and reports success.

`applyPull` returns each row's `airtableRecordId` alongside a nullable
`platformId`, and that pair is the integration's whole identity model: record
ids survive renames and re-sorts, and a null platform id is how the sync tells
"new in Airtable" from "already linked".

What each field means, which direction it moves and how to add one is
[Airtable](/docs/platform/guides/airtable). Every export is in the generated
[`@devdogsuga/airtable`](/docs/toolkit/reference/api/airtable) reference.
