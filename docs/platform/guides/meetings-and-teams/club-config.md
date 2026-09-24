---
name: Config-as-code (meetings & workshops)
description: Where meetings and workshops come from now — a versioned data file instead of Airtable, validated at CI, reconciled into Postgres on a schedule and after deploy.
order: 6
---

# Config-as-code

**Meetings and workshops are authored as data, not typed into a base.**
`@devdogsuga/club-config` (`packages/club-config`) holds a Zod schema, a
publishability validator, and the data itself — `data/meetings.json` today,
one file per term if that ever stops being enough. Officers propose a change
as a pull request against that file; CI's `pnpm --filter @devdogsuga/club-config
check` blocks the merge if it does not parse or fails a publishability rule.
There is no runtime refusal path any more — see
[Airtable sync](/docs/platform/guides/meetings-and-teams/airtable-sync) for
what that looked like when Airtable was the CMS for these two tables.
Competitions moved off Airtable too, to a GitHub Projects mirror — see
[Competitions](/docs/platform/guides/meetings-and-teams/competitions).

## Why this replaced the Airtable pull

Airtable gave non-technical editors typed fields and linked records, but the
tradeoff was a whole refusal subsystem: every publishable value needed a rule
that ran on every pass, decided whether the edit was safe, and wrote the
verdict back into a `⚙️ Sync status` cell for an officer to find. A pull
request has none of that machinery to build, because the same two questions
— "is this the right shape" and "can this go on a public page" — are answered
once, before the merge, by people who can read a diff. Nothing reaches
Postgres that CI has not already approved.

## The shape

`packages/club-config/src/schema.ts` is the Zod schema: a meeting has an
authored, stable `id` (a slug, or an old Airtable record id — see
[Migrated ids](#migrated-ids) below), a title, a summary, `kind` and
`building` from the same closed lists the database checks, a location,
start/end times, an RSVP link, a cancellation reason paired with a
cancellation date, a single `countsForCredit` flag, an optional `surveyUrl`,
and an `agenda` of workshops. A workshop is an authored `id`, a title, a
description, and a **free-text** `project` recommendation — no foreign key,
no `projects` table. That table is gone; a workshop that used to link to
"Platform" or "Scheduler" now just says so in a string, the way an officer
would say it out loud at the meeting.

`src/validator.ts` is the publishability half, ported from the refusal rules
the Airtable pull used to run per field: name/summary/title/description
lengths, the RSVP-host allowlist, cancellation reason↔date pairing — plus two
checks that only make sense once identity is authored rather than assigned by
Airtable: **every id is unique across the whole config**, and **every id
matches a slug-ish pattern**. `getClubConfig()` (the package's main export)
runs both the schema and the validator and throws a readable
`ClubConfigError` if either fails; `check.ts` is the CLI wrapper CI runs.

## The reconcile

`apps/platform/src/server/config/reconcile.ts` is the config equivalent of
the old `pullMeetings`/`pullWorkshops`: upsert by `configId`, soft-archive a
row whose `configId` drops out of the config (`deletedAt` is set; attendance
survives), and un-archive one that reappears. Read its header for the one
thing that differs from the Airtable model on purpose — **there are no
per-row refusals any more**. A config file either validates whole, or the
reconcile aborts the ENTIRE run and reports to Sentry rather than applying
part of it. There is no "officer is mid-edit" state to protect against
here, because nothing reaches this function until CI has already approved
the file it came from; a validation failure this late means CI was bypassed
or the config was constructed some other way, and the conservative answer is
to change nothing and leave a loud alert rather than guess. The same is true
of an empty config — zero meetings aborts rather than archiving the entire
schedule.

## Trigger

Two paths reach the reconcile, both through
`GET /cron/config-reconcile` (`CRON_SECRET`-guarded, same convention as every
other cron route):

- **The shared fifteen-minute cron slot** in `cloudflare/scheduled.ts`
  (`*/15 * * * *`, alongside the Airtable sync) — a keep-alive more than a
  primary trigger.
- **The deploy pipeline, post-migrate**, so a promoted config lands the
  moment the deploy finishes rather than waiting on the next tick.
  `pnpm devtools cron run` sends authenticated GETs to every route-backed
  cron entry and can target this one directly; wiring an explicit step into
  `.github/workflows/deploy.yaml` is still open — see the platform redesign
  followups.

## Local development

`supabase/seed/production/` and `supabase/seed/development/` only ever hold
roles, officers, and moderation fixtures — meetings and workshops are not
part of either, because they come from
`@devdogsuga/club-config` via the reconcile, and the reconcile is a platform
route rather than a devtools-side function (it needs the app's Drizzle
client, relations and Sentry wiring, none of which belong in devtools). So on
a local database, `pnpm devtools db reset` calls that route itself once the
reset finishes — the same unauthenticated request `cron run` would send, to
`http://localhost:3000` by default. If the platform dev server happens to be
up already, meetings and workshops come out of the reset seeded, no extra
step needed. If nothing is listening yet (a first-time reset, before anyone
has run `pnpm --filter platform dev`), `db reset` says so and names the fix:
start the platform app, then either re-run `pnpm devtools db reset` or run
`pnpm devtools cron run --app platform --cron '*/15 * * * *' --yes` directly.

## Migrated ids

The data that seeded `data/meetings.json` came from the Airtable base this
replaced. Every migrated meeting and workshop keeps its **old Airtable
record id** (`"recXXXXXXXXXXXXXX"`) as its `configId`, so the reconcile's
first pass matched the existing Postgres rows one-to-one instead of archiving
everything and re-creating it under new ids — which would have looked, to a
member, like every meeting's attendance history vanishing. New meetings and
workshops authored from here on use ordinary slugs instead
(`"cold-start-2027"`); the id format does not care which kind a given row is,
only that it is unique and slug-shaped.
