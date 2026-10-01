---
name: Events (meetings & workshops)
description: Where meetings and workshops come from — versioned config in the Backstage repo, validated at Backstage CI, reconciled into Postgres after every deploy and on a keep-alive schedule.
order: 6
section: infrastructure
---

# Events

**Meetings and workshops are authored as data, not typed into a base.**
`@devdogsuga/events` holds a Zod schema, a publishability validator, and the
data itself — `src/data/meetings.json` today, one file per term if that ever
stops being enough. It is a published package, and its source lives in the
sibling **Backstage** repository, not here: officers propose a change as a
pull request against `packages/events/src/data/meetings.json` there, and
Backstage's own CI (`pnpm -F @devdogsuga/events check:events`) blocks the merge
if it does not parse or fails a publishability rule. There is no runtime
refusal path — Airtable's per-field sync-status refusals are gone along with
the rest of that integration. Competitions never went through Airtable at
all; they are a GitHub Projects mirror — see
[Competitions](/docs/platform/guides/meetings-and-teams/competitions).

## The shape

Backstage's `packages/events/src/schema.ts` is the Zod schema: a meeting has
an authored, stable `id` (a slug, or a migrated Airtable record id — see
[Migrated ids](#migrated-ids) below), a title, a summary, `kind` and
`building` from the same closed lists the database checks, a location,
start/end times, an RSVP link, a cancellation reason paired with a
cancellation date, a single `countsForCredit` flag, an optional `surveyUrl`,
and an `agenda` of workshops. A workshop is an authored `id`, a title, a
description, and a **free-text** `project` recommendation — no foreign key,
no `projects` table. That table is gone; a workshop that used to link to
"Platform" or "Scheduler" now just says so in a string, the way an officer
would say it out loud at the meeting.

`src/validator.ts` is the publishability half: name/summary/title/description
lengths, the RSVP-host allowlist, cancellation reason↔date pairing, **every id
is unique across the whole config**, and **every id matches a slug-ish
pattern**. `getClubConfig()` (the package's main export) runs both the schema
and the validator and throws a readable `ClubConfigError` if either fails;
`check.ts` is the CLI wrapper Backstage's CI runs.

## The reconcile

`apps/platform/src/server/config/reconcile.ts`, in this repo, is the consumer:
upsert by `configId`, soft-archive a row whose `configId` drops out of the
config (`deletedAt` is set; attendance survives), and un-archive one that
reappears. Read its header for the one deliberate property — **there are no
per-row refusals**. A config file either validates whole, or the reconcile
aborts the ENTIRE run and reports to Sentry rather than applying part of it.
There is no "officer is mid-edit" state to protect against here, because
`@devdogsuga/events` is an installed npm dependency: nothing reaches this
function until Backstage's own CI has already approved the file that produced
it, and a validation failure this late means that package shipped a bug, not
something this repo caused. The same is true of an empty config — zero
meetings aborts rather than archiving the entire schedule.

## Trigger

Two paths reach the reconcile, both through
`GET /cron/config-reconcile` (`CRON_SECRET`-guarded, same convention as every
other cron route):

- **The deploy pipeline**, immediately after each deploy of `platform`
  (`.github/workflows/deploy-app.yaml`'s "Reconcile meetings/workshops from
  @devdogsuga/events" step, via `backstage deploy reconcile`).
  This is the primary trigger: a promoted config lands the moment its own
  build goes live, because the `@devdogsuga/events` version reconciled
  against is whichever one that build bundled in — reconciling at migrate
  time instead would apply the _previous_ release's config to the _new_
  one's rows.
- **The shared fifteen-minute cron slot** in `cloudflare/scheduled.ts`
  (`*/15 * * * *`) — a keep-alive for whatever the deploy-time call might
  have missed, not a primary trigger.

## Local development

`supabase/seed/` only ever holds roles and officers — meetings and
workshops are not part of it, because they come from `@devdogsuga/events` via
the reconcile, and the reconcile is a platform route rather than a
devtools-side function (it needs the app's Drizzle client, relations and
Sentry wiring, none of which belong in devtools). `supabase db reset` no
longer calls that route, so on a fresh development database, start the
platform app (`pnpm -F platform dev`) and fire the cron once, the same
unauthenticated request the schedule sends, to `http://localhost:3000` by
default:

```bash
pnpm devtools cron run --app platform --cron '*/15 * * * *' --yes
```

`pnpm devtools setup` lists this as one of its next steps. Repeat it after
you change the events config.

## Migrated ids

The data that seeded `src/data/meetings.json` came from the Airtable base this
replaced. Every migrated meeting and workshop keeps its **old Airtable
record id** (`"recXXXXXXXXXXXXXX"`) as its `configId`, so the reconcile's
first pass matched the existing Postgres rows one-to-one instead of archiving
everything and re-creating it under new ids — which would have looked, to a
member, like every meeting's attendance history vanishing. New meetings and
workshops authored from here on use ordinary slugs instead
(`"cold-start-2027"`); the id format does not care which kind a given row is,
only that it is unique and slug-shaped.
