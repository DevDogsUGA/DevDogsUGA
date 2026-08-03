---
name: Reporting & Feedback
description: How a DevDogs app lets users report content and submit feedback — the RPC contract, both consumption paths, and what a table must do to become moderatable.
---

# Reporting & Feedback

Every DevDogs app shares one Supabase project, with a Postgres schema per app. Reporting and feedback are therefore not an HTTP API any more, and there is no SDK that owns the contract.

**The contract is a set of `platform` functions plus the row-level security around them**, reached through PostgREST. TypeScript and Dart call the same functions with the same arguments and get the same JSON. `@devdogsuga/moderation` is sugar over those calls; if it ever disagrees with the SQL, the SQL is right.

> Replaces the old Feedback API, which documented REST endpoints that were never implemented. Nothing consumed them, and nothing was migrated.

## Three surfaces

| Surface                                         | Who uses it              | What it is                                                                        |
| ----------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------- |
| `platform` RPCs                                 | consumer apps            | the public contract: file a report, submit feedback, read reasons/topics/outcomes |
| `platform` tables via RLS                       | the DevDogs console only | moderator queues, resolutions, audit log                                          |
| a foreign key to `platform."reportResolutions"` | app migrations           | how a table declares itself moderatable                                           |

Consumer apps never touch `platform` tables directly, and the console never uses the RPCs. That split is what keeps the public surface narrow enough to change without breaking apps.

## Why RPCs rather than direct table writes

Three independent reasons, any one of which would be sufficient.

**Server-side truth.** A client filing a report knows the content reference and the reason. It does _not_ legitimately know who authored the content or what it said — those must come from the content itself, or a tampered client can attribute content to the wrong user and hand moderators fabricated evidence. The RPC signature accepts only what the caller legitimately knows.

**Server-side decisions.** Corroboration (a second reporter on content that already has an open report), rate limiting, and snapshotting are decisions, not inserts.

**Flutter.** `supadart` reads only PostgREST's _default_ schema, which is `study_group_finder` — `config.toml` lists it first for exactly this reason. The Flutter app will therefore never have generated Dart models for `platform` tables. A function returning `jsonb` needs no model; table access would need hand-written Dart mirroring the TypeScript types by eye.

Reads are RPCs for that third reason too.

## The contract

All of these live in the `platform` schema and return `jsonb`.

| Function               | Arguments                                                                                       | Returns                        |
| ---------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------ |
| `list_report_reasons`  | `app_slug`                                                                                      | `[{ id, title, description }]` |
| `list_feedback_topics` | `app_slug`                                                                                      | `[{ id, label }]`              |
| `file_report`          | `app_slug`, `content_type`, `content_ref`, `reason_id`, `description`                           | `{ reportId, corroborated }`   |
| `submit_feedback`      | `app_slug`, `feedback_type`, `title`, `description`, `topic_id`, `severity`, `browser_metadata` | `{ feedbackId }`               |
| `my_reports`           | `app_slug`                                                                                      | the caller's reports           |
| `report_outcomes`      | `app_slug`, `since`                                                                             | the decided subset             |

`app_slug` is the app's slug in `platform."apps"` — **not** an OAuth client id. Which app this is and which OAuth client signed the user in are deliberately separate questions now; conflating them is what welded the old system to its auth model.

### From a Next.js app

```ts
import { fileReport, listReportReasons } from "@devdogsuga/moderation";

const reasons = await listReportReasons(supabase, "forum");

await fileReport(supabase, {
  app: "forum",
  contentType: "resource",
  contentRef: resource.id,
  reasonId: selected.id,
  description: note,
});
```

`supabase` is your app's ordinary client, scoped to your own schema — the package hops to `platform` internally. Plus `<ReportDialog>` and `<FeedbackDialog>`, portable React components themed through CSS custom properties:

```tsx
import { ReportDialog } from "@devdogsuga/moderation/react";
import "@devdogsuga/moderation/react/styles.css";

<ReportDialog
  open={open}
  onOpenChange={setOpen}
  client={supabase}
  app="forum"
  contentType="resource"
  contentRef={resource.id}
/>;
```

### From Flutter

The same calls, with no package and no generated models:

```dart
final reasons = await Supabase.instance.client
    .schema('platform')
    .rpc('list_report_reasons', params: {'app_slug': 'study_group_finder'});

await Supabase.instance.client
    .schema('platform')
    .rpc('file_report', params: {
      'app_slug':     'study_group_finder',
      'content_type': 'group',
      'content_ref':  group.id,
      'reason_id':    reasonId,
      'description':  note,
    });
```

`platform` is already exposed in `[api] schemas`, so this works with no configuration change. The Flutter team writes their own Dart widgets — React components cannot be shared — but they implement **no protocol**.

## What a report actually does

```
 user taps "Report"
        │
        ▼
 platform.file_report(...)
        │  ├─ resolves the content → rejects if it does not exist
        │  ├─ fills the reported user and the snapshot FROM THE SOURCE TABLE
        │  ├─ already an open report on this content? → records a corroboration
        │  └─ rate-limits the reporter
        ▼
 platform.reports (status = 'open')
        │
        ▼
 a moderator resolves it ──► one transaction:
        ├─ reports.status = 'resolved'
        ├─ a reportResolutions row
        ├─ apply_content_action(...) → sets your table's "quarantinedBy"
        └─ any suspension → platform.userSuspensions
        │
        ▼
 the effects are already live:
   · quarantined content vanishes because YOUR read policies filter on it
   · a suspended user cannot write anywhere, because every app's write
     policies call platform.is_suspended()
   · the reporter sees the outcome via report_outcomes()
```

There is no delivery step anywhere in that path, so there is nothing to retry, sign, back off, or reconcile.

The snapshot is **frozen at filing time**, so a moderator reviews what was actually reported even if the content is edited or deleted afterwards.

## What a reporter is told

`my_reports()` and `report_outcomes()` return a coarse `outcome` — `action_taken`, `no_violation`, or `dismissed` — plus `contentRemoved`. A reporter never learns what happened to the other user; another member's standing is not the reporter's business, and the console has the full record for anyone entitled to it. `moderatorNote` is internal and is never returned.

The `snapshot` comes back only for content types marked `public`. Visibility defaults to `restricted`, so forgetting to configure it can never turn reporting into a disclosure oracle for private content.

## Integrating an app

**Adding one column is the whole integration.** There is no registration call:

```sql
alter table forum."resources"
  add column "quarantinedBy" uuid
    references platform."reportResolutions"(id) on delete set null;
```

That foreign key _is_ the declaration. `platform.content_types()` asks the catalog which tables in a registered app's schema carry it, so the set of content types is **derived, never stored** — and derived state cannot drift out of sync with the schema it describes. Drop the column and the table stops being moderatable, with no stale registration left behind.

Everything else has a default:

| Property     | Derived from                                   | Override when                        |
| ------------ | ---------------------------------------------- | ------------------------------------ |
| content type | the table name                                 | you want `resource`, not `resources` |
| label        | title-cased table name                         | you want nicer wording               |
| author       | the table's single foreign key to `auth.users` | there are two                        |
| snapshot     | all `text`/`varchar` columns, in order         | a column is sensitive or noisy       |
| visibility   | **`restricted`**                               | the content is public                |
| URL          | none                                           | you want moderators to click through |

Overrides go in `platform."contentTypes"`, one optional row per table. That table also **declares** content that is reportable but not quarantinable — a profile, say, where the remedy is suspending the user rather than hiding a row.

Then three more things, none of which the platform can do for you:

**1. Stop clients writing the quarantine column.**

```sql
-- NOT `revoke update ("quarantinedBy") ...` — column privileges do not subtract
-- from table-level ones, so with a table-wide UPDATE grant in place that does
-- nothing at all and the author can clear their own quarantine.
revoke update on forum."resources" from anon, authenticated;
grant update ("title", "body") on forum."resources" to authenticated;
```

**2. Filter quarantined content in every read policy.**

```sql
using (
  "quarantinedBy" is null
  or "authorUserId" = (select auth.uid())
  or platform.has_permission((select auth.uid()), 'canModerate')
)
```

**This is the rule that gets silently missed.** Quarantine is the only moderation outcome whose effect lives in _your_ policies rather than the platform's, so it is the only one that can be wired up wrong while everything appears to work — the platform records the decision, sets the column, and has no way to notice nobody reads it.

**3. Consult the cross-app ban in every write policy.**

```sql
and not platform.is_suspended((select auth.uid()))
```

The conformance check (below) verifies all three, and [the sandbox app](/docs/platform/sandbox-app) is a worked example of all of them.

## Testing it

Content you create while developing lives on **your own instance**, never in the database production reads from. The tools at [`/tools/moderation`](https://devdogsuga.org/tools/moderation) and [`/tools/feedback`](https://devdogsuga.org/tools/feedback) run in your browser against a Supabase project you nominate.

```bash
pnpm sb start-local-stack       # prints the URL and publishable key
pnpm sb reset-local-database    # migrations, then seeds
```

Then open the tools, paste the URL and key, and sign in as a seeded persona (`member@sandbox.test` / `moderator@sandbox.test`, password `password`). You do not need to clone or run this monorepo to do any of that.

Two things make it safe:

- The tools read `platform."instance"` and **refuse any target that reports itself as production**, so the pointing mechanism cannot be aimed at live data.
- The target is stored per-browser and never server-side.

### The conformance check

`platform.conformance_check(app_slug)`, run from the Content Types card, answers "did I declare my content correctly?" before you write any app code. It reports, per content type: whether rows are addressable, whether an author can be derived, whether `resolve_content` works against a real row, whether quarantine is supported, whether clients can still write the quarantine column, and whether your policies mention it at all.

The last two are heuristics over policy text rather than proofs, and they say so — a false alarm gets looked at, a false pass does not.

### Things worth checking by hand

- **Does quarantine actually hide anything?** File a report, resolve it with `quarantine`, then look at your app's listing as a different user. This exercises _your_ read policy, which is the single most likely thing to be wrong.
- **Does a ban stop writes?** Suspend a persona, then try to write as them.
- **What does someone else see?** Sign in as a different seeded persona. You are always Root on your own instance, so clicking around never denies you anything — switching personas is the only way to encounter a permission boundary.

## Where the moderation decision lives

The **decision** is `platform."reportResolutions"` — the audit record, platform-owned, never lost. The **effect** is `"quarantinedBy"` on your own table, a foreign key pointing back at the decision that caused it.

Keeping the effect local is deliberate. Your app has to add a predicate to its read policies either way, so moving the state into `platform` would relocate the "silently missed" risk rather than removing it — while costing a partial index on the hot read path (`where "quarantinedBy" is null`) and turning every listing into a cross-schema anti-join. A local column also lets you express more than hiding: showing the author "removed by moderators", restoring, keeping something out of public lists but inside their own drafts.

`on delete set null` means deleting a decision un-quarantines automatically, and the column carries its own provenance — "why is this hidden?" is a join, not a guess.

## Related

- [The sandbox app](/docs/platform/sandbox-app) — the reference implementation, and the traps integration hides
- [Database & migrations](/docs/platform/database) — SQL is the source of truth; Drizzle types are generated from it
- [OAuth setup](/docs/platform/oauth-setup) — how a sibling project gets **Sign in with DevDogs**
