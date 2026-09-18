---
name: Schedule generation
description: The rule engine behind recommended schedules — how the search works, the ScheduleRule contract, and how to add a rule without touching the engine.
order: 3
---

# Schedule generation

Given a set of courses a student wants, the generator returns the best few
conflict-free schedules. It reads only what
[ingestion](/docs/schedule-builder/guides/ingestion) has already written to
Postgres; it never scrapes.

The design goal to internalise before changing anything: **a new preference is a
new rule, appended to a registry — not an edit to the engine.** The engine is
generic and stays that way.

## The flow

The entry point is the server action `getRecommendedSchedules`
(`src/server/actions/generate-schedule.ts`). It:

1. Resolves the requested campus name to an id.
2. `loadSections` (`src/lib/domain/loadSections.ts`) pulls candidate sections.
3. `filterUsableSections` / `groupSectionsByCourse`
   (`src/lib/generation/prepareCourses.ts`) shape them into per-course candidate
   groups.
4. `generateSchedules` (`src/lib/generation/engine.ts`) does the search and
   returns arrays of CRNs.

`src/lib/domain/section.ts` defines the shared `Section` / `Meeting` /
`Professor` contract that both generation and the on-screen schedule display
consume.

## The engine

`engine.ts` is an exhaustive cartesian search: one candidate section per
requested course, every combination. Two constants bound it —
`MAX_INPUT_COURSES = 10` (the search space is combinatorial) and
`MAX_RESULTS = 5` (what it returns).

It stays tractable by pruning partial schedules as it builds them, rather than
enumerating everything and filtering at the end:

- `noConflicts` (`src/lib/generation/noConflicts.ts`) is always applied directly
  — no two selected meetings may overlap.
- Each active rule's `allowSection` and `allowPartialSchedule` prune further.
- A complete schedule must pass every rule's `allowSchedule`, and is ranked by a
  weighted `scoreSchedule`.

## The `ScheduleRule` contract

Every rule implements the interface in `src/lib/generation/rule.ts`:

| Member                 | Purpose                                              |
| ---------------------- | ---------------------------------------------------- |
| `isActive`             | Whether this rule participates given the constraints |
| `allowSection`         | Reject a single section outright                     |
| `allowPartialSchedule` | Prune an in-progress combination early               |
| `allowSchedule`        | Accept or reject a _complete_ schedule               |
| `score`                | Contribute to ranking                                |
| `importance`           | The weight `score` is multiplied by                  |

> [!IMPORTANT]
> `allowPartialSchedule` **must be monotonic**: if a partial schedule is
> rejected, every schedule that extends it must also be rejectable. It is called
> mid-search on incomplete combinations, so a non-monotonic check prunes
> branches that would have become valid and silently drops correct results.
> Anything that is only knowable once a schedule is _complete_ — a minimum
> credit-hour floor, for example — belongs in `allowSchedule`, never in
> `allowPartialSchedule`.

## Adding a rule

1. Write a rule under `src/lib/generation/rules/` implementing `ScheduleRule`.
2. Append it to the `RULES` array in `src/lib/generation/registry.ts`. That
   array is the **single integration point** — the engine iterates it and needs
   no change.
3. Read the constraints your rule needs off `GenerationConstraints`
   (`src/lib/generation/constraints.ts`), the context object every rule receives.

Existing rules to model yours on: `excludedCourses`, `excludedSections`,
`campus`, `maxCreditHoursRule`, `minCreditHoursRule`, `preferredStartTimeRule`,
`preferredEndTimeRule`. Two dormant rules — `professorQuality` and `distance` —
sit in the registry with `isActive: false` as ready-made seams; `Professor.quality`
is always `null` today (the RateMyProfessors integration was removed), so the
quality rule stays off until a data source returns.
