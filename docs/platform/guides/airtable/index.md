---
name: Airtable
description: The officer base, the field registry that declares every synced field and its direction, and why field IDs rather than names are the wire format.
order: 1
---

# Airtable

Airtable is the officers' console. One base holds seven tables, and a sync pass moves data both ways: officer-authored configuration is pulled into Postgres, platform-owned state is pushed back out for officers to read. Read this before adding a field, changing what syncs, or debugging a pass. If you only need to know _what_ syncs and in which direction, that is [Airtable sync](/docs/platform/guides/meetings-and-teams/airtable-sync); for the package's exported functions, the generated [`@devdogsuga/airtable`](/docs/toolkit/reference/api/airtable) reference.

## The field registry

Everything the sync reads or writes is declared in one place, `packages/airtable/src/registry.ts` — seven tables (Members, Projects, Meetings, Workshops, Competitions, Teams, Attendance) and 52 fields, each holding the real ID pulled from the live base. That is what makes "we may want to push something else later" a one-line change rather than an archaeology exercise across the push, the pull, and the verifier.

```ts
export const members = table("Members", "tblLTJtir40NrL87x", {
  platformId: field
    .text("fldXg9IE8LgkjhfKy", "⚙️ Platform ID")
    .matchKey()
    .push((m: MemberRow) => m.userId),

  duesPaidAt: field
    .date("fld3p7eengCBxHjjj", "Dues paid")
    .pull((value) => (typeof value === "string" ? value : null)),

  notes: field.longText("fldmpCcukx7kkNMZs", "Notes").ignore(),
});
```

Three consumers read those declarations and no other source: the push builder, the pull parser, and `verify.ts`. Batching, change detection, and the `⚙️` naming convention are properties of the engine rather than of any field, so a newly declared one inherits them.

## Direction is per field, and the type enforces it

| Declaration | Meaning                                                   |
| ----------- | --------------------------------------------------------- |
| `.push()`   | Platform-owned. A projection of Postgres state            |
| `.pull()`   | Officer-authored. Parsed into Postgres                    |
| `.ignore()` | Officers' own column, deliberately untouched              |
| `.status()` | A refusal message the sync writes outside the push engine |

`.push()` and `.pull()` return different types, neither carrying the other method, so a field declared with both **fails to compile**. That turns the rule the whole integration rests on — never create a field both sides write — from a convention somebody has to remember into a type error. A field with no direction must say `.ignore()` out loud, so "does the sync know about Notes?" has an answer: absent means nobody looked, `.ignore()` means somebody decided.

`.status()` exists for one field, `⚙️ Sync status`, on the four tables that carry one, and it earns its own direction by breaking the engine's never-blank rule on purpose. Every pushed field is a projection, and for those a null means "we have not learned this yet" and must never be written as empty. A refusal message is not a projection: when the officer fixes the row it has to be **cleared**, because a stale refusal left in the grid reads as a live problem forever.

The `⚙️` prefix is a naming convention for officers, not something the API understands. It says "editing this will be overwritten on the next pass"; field editing permissions are what actually prevent that, and they are configured by hand — see [Base setup](/docs/platform/guides/airtable/base-setup).

## Field IDs are the wire format

`fldXg9IE8LgkjhfKy`, not `"UGA email"`. Airtable field names are editable by anyone with base access, and an officer tidying a column heading would otherwise silently break a name-keyed push. Field IDs never change.

Every read passes `returnFieldsByFieldId=true`, so responses come back keyed the same way. Note the asymmetry that makes this easy to get wrong: that flag is **response-only**. It does not make a request body ID-keyed — writing by ID is simply allowed — so a client that sets the flag and then writes by name reads one way and writes the other, and notices only on the first rename. The human-readable name stays in the registry as the second argument to each field, because it is what an officer will say when they report a problem.

## What the engine does with a declaration

- **Change detection.** The push projects each row to its Airtable representation and compares against what the base currently holds, skipping records whose values are unchanged. An absent field and an empty value are treated as one state, because Airtable omits empty fields from responses rather than returning null — without that, every record with one empty field looks changed on every pass, forever.
- **Never blanking.** A null projection omits the field from the payload rather than writing an empty value.
- **Batching at exactly 10**, which is `BATCH_SIZE` and not a tunable: exceeding it is a 422.
- **Backoff on 429, never on 422.** The five-requests-per-second per-base limit is universal, so retrying a rate limit is always right; retrying a malformed request never helps.

## Projects changed direction

Projects were the one officer-facing table the platform **owned**: it pushed the rows and Airtable held a mirror. That was wrong, and the way it was wrong is worth keeping written down, because the symptom looked like anything but its cause.

Nothing in the platform could create a project. No console page, no server action, no seed, and RLS denies every client write — the only inserts in the repo were test fixtures. Meanwhile `pullWorkshops` refused to create a workshop whose Project link did not resolve, and links resolved only by matching `⚙️ Platform ID` back to a row the platform had authored. So an officer doing the obvious thing — typing a project name into Airtable's link picker — got a Projects row with no platform id, which nothing would ever issue one to, and their workshop was skipped on every pass forever. It was reported as "workshops aren't syncing".

Pulling the table removes the failure rather than reporting it: the Project link resolves through the pull's idMap exactly like the Meeting link beside it. `pushProjects` and `projectIdMap` are gone, and `⚙️ Slug` went with them — the slug is derived from the name on insert and never recomputed, because `stars.csv` is keyed on it across semesters and regenerating it on a rename would rewrite an export somebody already has.

## Attendance is the exception

Six of the seven tables are either platform-owned and pushed or officer-authored and pulled. **Attendance is the one Airtable creates rows in** — from a form filled in during a workshop, or a co-branded event's roster pasted in — and the platform writes back only `⚙️ Platform ID` and `⚙️ Sync status`. The first makes a re-import idempotent and shows an officer that a response landed; the second carries the refusal when it did not — an unknown MyID, a Meeting or Workshop link the platform cannot resolve, or two links naming different nights. See [Attendance](/docs/platform/guides/meetings-and-teams/attendance) for why the form collects a MyID rather than an email address.

## Read next

- [Base setup](/docs/platform/guides/airtable/base-setup) — scaffolding the base, verifying it, and the identity columns Postgres needs first.
- [Runbook](/docs/platform/guides/airtable/runbook) — the ordered setup steps and the member push.
