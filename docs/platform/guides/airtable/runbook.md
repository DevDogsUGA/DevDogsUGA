---
name: Runbook
description: The ordered steps that take a workspace to a working sync, and the rules the member push follows once it is running.
order: 3
---

# Runbook

Standing a base up from nothing, in order — several of these fail confusingly out of order. Follow it once per base; after that, adding a field is the two-step scaffold in [Base setup](/docs/platform/guides/airtable/base-setup). For what a field declaration means, start at the [registry](/docs/platform/guides/airtable). Every credential named here is routed by [Env](/docs/platform/env).

## The order

1. **Create the workspace**, separate from other club Airtable use, so the sync's call budget is not shared with project management.
2. **Create the scaffolding token** on that workspace: `schema.bases:read`, `schema.bases:write`, `data.records:read`, `data.records:write`. ⚠️ **Mint it as whoever created the workspace** — base creation needs the workspace creator role, which no scope can grant; a collaborator's token fails only at step 4.
3. **Put it in `.env` as `AIRTABLE_PAT`.** It stays there only until step 11.
4. **`pnpm airtable:scaffold`** creates the seven tables and their fields. Use `--dry-run` first: the first real run is against a base somebody cares about.
5. **`pnpm airtable:pull-ids`**, then format and commit `registry.ts`. Steps 4 and 5 are what replace `fldTODO_*` placeholders.
6. **Walk the manual checklist** `verify` prints — field editing permissions first, since nothing can check them for you. Airtable's default `Table 1` is deleted here too.
7. **`pnpm airtable:verify`** must exit clean. If it does not, fix the base rather than the registry: the registry is what the code agrees with.
8. **Seed Projects** with one sync pass. Projects are platform-owned and pushed, so the table populates itself and officers get a linked-record list.
9. **Build the attendance form** against the Attendance table — a MyID field and a Workshop link at minimum. `Source` distinguishes a form response from a co-branded import.
10. **Only then author a meeting.** Earlier produces a workshop linked to nothing.
11. **Mint the sync token** — same workspace, everything except `schema.bases:write` — set it as `AIRTABLE_SYNC_PAT`, delete `AIRTABLE_PAT` from `.env`, and revoke the scaffolding token until the base next changes shape.
12. **Grant an officer role `canTriggerSync`** and run one pass from the console.

⚠️ **Do not promote the scaffolding token.** Give the runtime a write-capable token and it can reshape the base, with nothing downstream to notice. The two are separate keys, so a lingering `AIRTABLE_PAT` cannot win by accident — the runtime never reads it.

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

A pass that finds the base no longer matching the registry writes nothing, claims no lease, and records `schema_invalid` on the state row the console reads. Run `pnpm airtable:verify`, then fix the base.

<details>
<summary>Why does the alert fire only once, not on every refused pass?</summary>

The sync runs every fifteen minutes, so a base that has drifted refuses 96 times a day. An alert on every pass is one people mute — and a muted channel still looks like coverage, which is worse than no alert at all.

So only the **transition** into `schema_invalid` is news. The refusal is recorded on the state row every pass regardless, because until that row existed the console showed the last _successful_ pass with no sign that every pass since had refused. The alert says which fatal findings caused it and that it will not be repeated until the base is fixed and drifts again.

</details>
