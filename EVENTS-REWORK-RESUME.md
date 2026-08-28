# Events rework — where this branch stands

Full plan and rationale: https://claude.ai/code/artifact/5e120a8a-f098-4a74-be0a-5acd38cf16cf

Branch `worktree-events-rework-impl`, pushed. Three feature commits.

## State

`pnpm typecheck` reports **186 errors against a pre-existing baseline of 202**
on this branch — i.e. none of them are from this work, and building
`packages/airtable` (which was never built here) cleared sixteen that predate
it. **328 tests pass across 24 files**, plus 85 in the airtable package.

Build the package once before running anything: `cd packages/airtable && npx
tsc`. Without it four test files fail to collect and the typechecker reports
phantom errors, on this branch and on `main` alike.

## Done

- **Migration** `20260828000000_platform_events_rework.sql`, applied locally.
  `cancelledAt` / `cancellationReason`; `name` → nullable `nameOverride`;
  `workshops.title` / `description` and nullable `projectId`; the `kind` list
  swapped to Build session / Study session / Interest meeting / Social.
- **Derivation.** Segment order is `workshop → kickoff → judging → open`;
  `open` is suppressed when `kind` is set, so `segments` can be empty;
  `kindOverride` is gone from `MeetingBilling`.
- **`meetingTitle()`** backs the page title, the JSON-LD name, the dialog's
  accessible name and the archive. **`clubDay` / `clubDateKey`** lifted into
  `lib/eventTime` beside `EVENT_TZ`; `clubDateKey` is the slug source.
- **Loaders.** `summaryColumns` carries `nameOverride` and both cancellation
  columns; seven `projects` joins became left joins; where a project name was
  doubling as the *competition's* name it coalesces through the workshop title
  to the competition slug; `getUpcomingMeetings` filters cancelled and
  `getMeetingsInRange` deliberately does not.
- **`meetingView`.** `kindBadge`, `primaryBadge`, `meetingBadges`; `open`
  relabelled "Unscheduled"; `SEGMENT_LEGEND` deleted.
- **Calendar.** Dot consults `kind` first; legend derived from the visible
  month with a "No events this month" empty state; popover leads with the date.
- **Chips and names** updated in `ScheduleList`, `NextMeetingStrip`,
  `PastMeetings`, and the `[slug]` layout and page.
- **Airtable.** `MEETING_KIND_CHOICES` matches the constraint; `MeetingRow.name`
  → `nameOverride`; the sync's completeness check no longer requires a name;
  `describeIncompleteMeeting` no longer asks for one; the slug is derived from
  the date.

### One deviation from the plan

Build session is **emerald**, not the cyan the plan specified. Cyan already
belongs to `kickoff` in this codebase — it took it when the timeline had to
draw judge-then-kickoff as two ends of one loop. The plan's "kickoff and
workshop share emerald" premise is stale here; every segment already has its
own hue.

## Two environment traps

1. **`.env`'s `DB_URL` points at the remote Supabase pooler, not localhost.** A
   plain `pnpm db:pull` introspects *staging* and writes its shape over the
   committed schema. Use
   `DB_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres' npx drizzle-kit pull --config drizzle.config.ts`
   then `npx tsx scripts/post-pull.ts`.
2. **The local database is ahead of this branch** — `profile.majors` /
   `minors` / `certificates`, `roles_isLeadership_rank_idx`,
   `roleDescription varchar(512)`, none of which has a migration here. They
   look like the `officer-seed` work. A pull from local therefore writes
   phantom schema, which is why the generated file was edited surgically.

## One manual step left, in the Airtable UI

Scaffolding is done: the four new fields exist in the base and their real ids
are committed. All suites pass.

`pnpm airtable:verify` still reports one fatal, and it is the one thing no
amount of tooling can do. Airtable's Meta API cannot modify an existing
select's choices **at all** — not add, not rename, not delete. A `PATCH`
carrying a new choice list comes back
`"Changing a field's type or number precision is not currently supported"`,
with or without `type` echoed in the body. `scaffold.ts` says the same thing
in its own words: choices are set at CREATION, the client has no `updateField`,
and "adding a choice to a live base is a manual edit in the Airtable UI".

So all four steps below are UI work. In the **Kind** field on the Meetings
table:

1. **Rename** `Info session` → `Interest meeting`. Rename, do NOT delete: one
   live meeting record currently uses it, and deleting the choice clears that
   cell.
2. **Delete** `Career` and `Open lab`. Both are unused — zero records.
3. **Add** `Build session` and `Study session`.
4. Keep `Social` as it is.

Then `pnpm airtable:verify` should come back clean and the sync will run.

While in there, the `Name` field wants relabelling to "Custom name — irregular
events only". That one is cosmetic but it has a code half: the label string in
`registry.ts` must change in the same commit, because `verify` matches the live
base by field name and would fail on the mismatch otherwise.

## Remaining

- **`pnpm airtable:scaffold && pnpm airtable:pull-ids`**, plus the two manual
  Airtable UI edits above. That is the only thing between this branch and a
  green suite.
- **The dead `?past=` link.** `PastMeetings` renders `?past=2` and
  `events/layout.tsx:121` hardcodes `pastPage: 1`, so it navigates and nothing
  changes. Pre-existing, and now more visible beside a working search box. The
  layout cannot read search params, so fixing it means moving the archive's
  paging into the client component it already is, or moving the band into a
  page.
- **Jump-to-week from the calendar**, which the plan wanted and this does not
  do. The calendar keeps its hover popover; clicking a day still opens the
  meeting rather than scrolling the list to that week.
- **`/events/directions?b=Tate` shows a DLW header** — `directions/layout.tsx`
  renders `FindUsHeader` with no props while the page resolves the real
  building from `?b=`. Same root cause as the dead link: a layout cannot read
  search params. Unrelated to this work.
- **`FindUsLink` and `getWorkshopDetail` are both dead code**, discussed in
  comments as if live. Wire up or delete.

Delete this file when the branch lands.
