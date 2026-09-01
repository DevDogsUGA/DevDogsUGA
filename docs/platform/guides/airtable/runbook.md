---
name: Runbook
description: The ordered steps that take a workspace to a working sync, and the rules the member push follows once it is running.
order: 3
---

# Runbook

Standing a base up from nothing, in order — several of these fail confusingly out of order. Follow it once per base; after that, adding a field is one `apply` — see [Base setup](/docs/platform/guides/airtable/base-setup). For what a field declaration means, start at the [registry](/docs/platform/guides/airtable). Every credential named here is routed by [Env](/docs/toolkit/guides/env).

## The order

1. **Create the workspace**, separate from other club Airtable use, so the sync's call budget is not shared with project management.
2. **Create the bootstrap token** on that workspace: `schema.bases:read`, `schema.bases:write`, `data.records:read`, `data.records:write`. ⚠️ **Mint it as whoever created the workspace** — base creation needs the workspace creator role, which no scope can grant; a collaborator's token fails only at step 4.
3. **Put it in `.env` as `AIRTABLE_APPLY_PAT`.** That is the write-capable name the tooling resolves, and it stays in your file only until step 10. There is no separate scaffolding key: a fourth token existed for this and was removed, because the only job it kept after step 4 was one a read can do.
4. **`pnpm devtools airtable apply`** creates the seven tables and their fields, writes the discovered ids into `registry.ts`, formats it with Prettier, and refreshes `schema-snapshot.json`. Use `--dry-run` first: the first real run is against a base somebody cares about. Then commit both files — this is what replaces the `todo()` placeholders. Record the new base's id as `BASE_ID` in `registry.ts` while you are there; it is committed beside the ids this step writes, not routed through the env system.
5. **Walk the manual checklist** `apply` prints — field editing permissions first, since nothing can check them for you. Airtable's default `Table 1` is deleted here too.
6. **`pnpm devtools airtable verify`** must exit clean. If it does not, fix the base rather than the registry: the registry is what the code agrees with.
7. **Author the projects** directly in the Projects table — a Name each, and an Order if the schedule should list them in a particular sequence. They used to arrive by themselves, pushed from Postgres, which is why this step used to say "seed with one sync pass"; the table is officer-authored now. Nothing else can create one.
8. **Build the attendance form** against the Attendance table — a MyID field and a **Meeting** link at minimum, with the Workshop link beside it and **not required**. `Source` distinguishes a form response from a co-branded import. See [Attendance](/docs/platform/guides/meetings-and-teams/attendance) for why the workshop is optional: an Interest Meeting, a Social and a judging night run no workshops, and a form that demanded one could not describe them.
9. **Only then author a meeting.** Earlier produces a workshop linked to nothing.
10. **Mint the sync token** — same workspace, everything except `schema.bases:write` — set it as `AIRTABLE_SYNC_PAT`, delete `AIRTABLE_APPLY_PAT` from `.env`, and revoke the bootstrap token. It does not come back: later schema changes go through `deploy airtable-apply`, which holds the apply token in the `production-apply` environment behind required reviewers.
11. **Grant an officer role `canTriggerSync`** and run one pass from the console.

## Bringing an existing base up to the current registry

Two fields on Projects are declared with `todo()` placeholders, which means the
sync **refuses every pass** with `schema_invalid` until the base has them. That
refusal is the point — a placeholder reaching a live sync writes into nothing
and reports success — but it does mean these steps are not optional and are not
a background task.

1. **`pnpm devtools airtable apply --dry-run`**, then without the flag. It
   creates `Order` (a number) and `⚙️ Sync status` on Projects, replaces
   `todo("projects_sort_order")` and `todo("projects_sync_status")` in
   `registry.ts` with the real `fld` ids, and refreshes
   `schema-snapshot.json` from the same schema read. It formats `registry.ts`
   automatically; commit both files. That is what turns the suite green: `verify.test.ts` asserts no
   placeholder reaches main, `run.test.ts` fails on the same finding through
   `verifyBase`, and three tests in `devtools` replay the committed snapshot as
   a base that needs nothing.
2. **Delete `⚙️ Slug` from Projects by hand.** The scaffolder is create-only
   and will not remove it. It is no longer in the registry, so `verify` reports
   it as an extra field rather than failing, but it is a column showing
   officers a value they cannot edit and must not rely on — the slug is derived
   on insert and never recomputed.
3. **Lock down `⚙️ Sync status`** on Projects, the way step 5 above describes
   for every other platform-owned column.
4. **`pnpm devtools airtable verify`** must exit clean.

### The projects themselves

The Projects table is authored by officers now, and the platform has no way to
create a row in it. Existing Postgres projects have no `airtableRecordId`, so
the pull will not adopt them; type each project into the Projects table and let
the pull create it. Then **re-point every workshop's Project link** at the row
that appears, and delete whatever was linked before.

⚠️ **The base is shared — staging and production use the same one.** `BASE_ID`
is a committed constant. A sync pass from a local checkout writes to the club's
real base, so this is not something to rehearse against a copy.

⚠️ **Do not give the runtime a write-capable token.** It could then reshape the base with nothing downstream to notice. The keys are separate and the resolver's write row names `AIRTABLE_APPLY_PAT` alone, so a lingering copy of anything else cannot win by accident — and after step 10 no laptop holds a token that can write a schema at all.

## The member push

Members is push-only apart from dues, and carries the most identifying data of any table here, so its rules are tighter.

| Field                  | Direction | Source                                     |
| ---------------------- | --------- | ------------------------------------------ |
| `⚙️ Platform ID`       | push      | `profile.userId` — the match key           |
| `UGA email`            | push      | `profile.ugaEmail`                         |
| `Legal name`           | push      | `profile.legalFirstName` + `legalLastName` |
| `⚙️ Meetings attended` | push      | Distinct meetings in `attendance`          |
| `Dues paid`            | **pull**  | Officer-authored                           |
| `Notes`                | ignored   | The officers' own column                   |

- **Never blank a pushed identity field.** A null in Postgres omits the field from the payload rather than writing an empty value. Null means "we have not learned it", never "it is empty", and the distinction is invisible once written.
- **Nothing from the profile proper.** `preferredName`, `pronouns`, `bio`, and the social links stay in Postgres: member-authored and mutable, which is the opposite of what this table is for. The registry makes adding a field one line, which is why the boundary has to be written down.
- **Teams push their points the same way.** `⚙️ Points` comes from `competitionStandings`, which does not exist until the tally has run, so it is null during a live competition — and the never-blank rule keeps that a blank ("not scored yet") rather than a zero ("scored nothing"). See [Scoring](/docs/platform/guides/elections/scoring).

## When a pass refuses

A pass that finds the base no longer matching the registry writes nothing, claims no lease, and records `schema_invalid` on the state row the console reads. Run `pnpm devtools airtable verify`, then fix the base.

<details>
<summary>Why does the alert fire only once, not on every refused pass?</summary>

The sync runs every fifteen minutes, so a base that has drifted refuses 96 times a day. An alert on every pass is one people mute — and a muted channel still looks like coverage, which is worse than no alert at all.

So only the **transition** into `schema_invalid` is news. The refusal is recorded on the state row every pass regardless, because until that row existed the console showed the last _successful_ pass with no sign that every pass since had refused. The alert says which fatal findings caused it and that it will not be repeated until the base is fixed and drifts again.

</details>
