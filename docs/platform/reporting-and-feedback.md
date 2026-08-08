---
name: Reporting
description: How a DevDogs app lets users report content — the RPC contract, both consumption paths, the reason vocabulary, and what a table must do to become moderatable.
---

# Reporting

Every DevDogs app shares one Supabase project, with a Postgres schema per app. Reporting is therefore not an HTTP API any more, and there is no SDK that owns the contract.

**The contract is a set of `platform` functions plus the row-level security around them**, reached through PostgREST. TypeScript and Dart call the same functions with the same arguments and get the same JSON — and because those functions declare their columns, `supabase gen types` types both the arguments and the results. There is no hand-written client to disagree with the SQL.

> **Feedback used to live here and no longer does.** It is an Airtable form with automations behind it, outside the platform entirely: `platform."feedback"`, `feedbackTopics`, `submit_feedback`, `list_feedback_topics`, the `canManageFeedback` permission and the console pages that used them are all gone. Reporting is for policy violations; anything else belongs in that form.

## Three surfaces

| Surface                                         | Who uses it              | What it is                                                                   |
| ----------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------- |
| `platform` RPCs                                 | consumer apps            | the public contract: file a report, read the reasons, read your own outcomes |
| `platform` tables via RLS                       | the DevDogs console only | moderator queues, resolutions, audit log                                     |
| a foreign key to `platform."reportResolutions"` | app migrations           | how a table declares itself moderatable                                      |

Consumer apps never touch `platform` tables directly, and the console never uses the RPCs. That split is what keeps the public surface narrow enough to change without breaking apps.

## Why RPCs rather than direct table writes

Three independent reasons, any one of which would be sufficient.

**Server-side truth.** A client filing a report knows the content reference and the reason. It does _not_ legitimately know who authored the content or what it said — those must come from the content itself, or a tampered client can attribute content to the wrong user and hand moderators fabricated evidence. The RPC signature accepts only what the caller legitimately knows.

**Server-side decisions.** Corroboration (a second reporter on content that already has an open report), rate limiting, and snapshotting are decisions, not inserts.

**Flutter.** `supadart` reads only PostgREST's _default_ schema, which is `study_group_finder` — `config.toml` lists it first for exactly this reason. The Flutter app will therefore never have generated Dart models for `platform` tables, and an RPC needs none: Dart reads `List<Map<String, dynamic>>`. Table access would need hand-written Dart mirroring the TypeScript types by eye.

> These functions used to `return jsonb` on the grounds that a jsonb result was what made them language-neutral. That was wrong, and worth recording so it is not reintroduced. PostgREST publishes **no response schema for any RPC** — `{"200": {"description": "OK"}}`, identically for a `jsonb` function and for one returning a table — so supadart could never have typed the results either way, and it does not read the `platform` schema at all. Meanwhile `supabase gen types` reads the _catalog_, so `returns table (...)` gives TypeScript every column name and type. The jsonb form was costing return types and buying nothing.

Reads are RPCs for that third reason too.

## The contract

All of these live in the `platform` schema. They are set-returning, so **every result is a JSON array** — including the ones that logically return a single object. `file_report` comes back as `[{ reportId, corroborated }]`; use `.single()` or `[0]`.

| Function              | Arguments                                                          | Returns                            |
| --------------------- | ------------------------------------------------------------------ | ---------------------------------- |
| `list_report_reasons` | none                                                               | `[{ reason, title, description }]` |
| `file_report`         | `app_slug`, `content_type`, `content_ref`, `reason`, `description` | `{ reportId, corroborated }`       |
| `my_reports`          | `app_slug`, `since`, `only_open`                                   | the caller's reports               |

Three functions, and that is the whole public surface. `report_outcomes` used to be a fourth; it was `my_reports` with `status <> 'open'` and a `since` filter, so it is now those two parameters. `only_open` is `null` for everything, `true` for open reports, `false` for decided ones.

`app_slug` is the app's slug in `platform."apps"` — **not** an OAuth client id. Which app this is and which OAuth client signed the user in are deliberately separate questions now; conflating them is what welded the old system to its auth model.

## The reason vocabulary

There is **one global list of reasons**, shared by every app and every content type. It is a Postgres enum, `platform."reportReason"`, so `file_report` takes a label rather than a uuid — which means a client can hardcode one, a test can fixture one, and reports can be grouped by reason across apps without joining to an editable title.

> **This table is a hand-maintained copy and may be out of date.** The database is the source of truth. Run `pnpm devtools catalog` to print the reasons and content types an instance actually has.

| Label            | Title          |
| ---------------- | -------------- |
| `harassment`     | Harassment     |
| `hate_speech`    | Hate speech    |
| `violence`       | Violence       |
| `sexual_content` | Sexual content |
| `impersonation`  | Impersonation  |
| `spam`           | Spam           |
| `off_topic`      | Off-topic      |
| `other`          | Something else |

Titles and ordering live in `platform."reportReasons"`, keyed by the enum, so re-wording a reason applies retroactively to reports already filed — `my_reports` returns the label, and the client renders the current title. Display order comes from a `position` column, not from sorting by title, which is what keeps "Something else" at the end.

**`other` requires a description**, enforced inside `file_report` so it holds for Dart and TypeScript alike. A catch-all with no sentence attached is something a moderator can only dismiss.

TypeScript gets the labels as a union with no work of its own, because `supabase gen types` emits every enum twice — as a type and as a runtime array:

```ts
import type { Database } from "@devdogsuga/supabase";
import { Constants } from "@devdogsuga/supabase";

type ReportReason = Database["platform"]["Enums"]["reportReason"];
Constants.platform.Enums.reportReason; // ["harassment", "hate_speech", ...]
```

Dart gets nothing generated: `supadart` reads only PostgREST's default schema, which is `study_group_finder`, so it never sees `platform`. Write the enum by hand from the table above, and check it against `pnpm devtools catalog`. Postgres rejects an unknown label by type before `file_report` runs, so a mistake fails loudly rather than filing something odd.

**Adding a reason takes two migrations.** `alter type ... add value` cannot be used in the transaction that adds it, so the label lands in one file and its presentation row in the next. A test in `packages/supabase/testing` compares `enum_range()` against the table, so writing only the first file fails CI instead of shipping a reason that `file_report` accepts and `list_report_reasons` never returns.

### From a Next.js app

```ts
const { data: reasons } = await supabase
  .schema("platform")
  .rpc("list_report_reasons");
// reasons: { reason: ReportReason; title: string; description: string }[]

const { data, error } = await supabase.schema("platform").rpc("file_report", {
  app_slug: "forum",
  content_type: "resource",
  content_ref: resource.id,
  reason: "spam",
  description: note,
});
// data: { reportId: string; corroborated: boolean }[]
```

No wrapper package: argument names and result shapes both come from `supabase gen types`, so the compiler checks them against the actual functions. `supabase` is your app's ordinary client, scoped to your own schema; `.schema("platform")` is the hop. Plus `<ReportDialog>`, themed through CSS custom properties. It lives in `apps/platform/src/components/moderation/`; an app outside this repository copies them, because nothing here is published and a package shared with nobody is just a longer import path:

```tsx
import { ReportDialog } from "~/components/moderation";

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
    .rpc('list_report_reasons');

await Supabase.instance.client
    .schema('platform')
    .rpc('file_report', params: {
      'app_slug':     'study_group_finder',
      'content_type': 'group',
      'content_ref':  group.id,
      'reason':       'spam',
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

Content you create while developing lives on **your own database**, never in the one production reads from. Everything below runs locally:

```bash
pnpm devtools
```

That opens a menu — you do not need to know any command names, and every entry explains what it will do before it does it. `pnpm sb` is the same tool under its older name, and every `pnpm sb <cmd>` in the rest of these docs still works.

| Menu entry                      | What it does                                                    |
| ------------------------------- | --------------------------------------------------------------- |
| Start my database               | boots the local Docker stack and writes `.env.generated`        |
| Reset my database               | replays every migration, then the seeds                         |
| Apply new migrations            | without erasing anything                                        |
| Show what can be reported       | the reason vocabulary and every app's content types             |
| Check an app's moderation setup | `platform.conformance_check()` — what the catalog derived       |
| Test reporting end to end       | files a report, quarantines it, and checks who can still see it |

The seeds create three personas — `member@`, `author@` and `moderator@sandbox.test`, password `password` — and the sandbox content they act on.

Before anything touches a database, the tool reads `platform."instance"` and **refuses any instance that reports itself as production**, so none of this can be aimed at live data.

### The conformance check

`platform.conformance_check(app_slug)` answers "did I declare my content correctly?" before you write any app code. Per content type it reports whether rows are addressable, whether an author can be derived, whether `resolve_content` works against a real row, whether quarantine is supported, whether clients can still write the quarantine column, and whether your policies mention it at all.

The last two are heuristics over policy text rather than proofs, and they say so — a false alarm gets looked at, a false pass does not.

```bash
pnpm devtools doctor --app forum    # skips the picker, for CI
```

### The round-trip is the one that matters

**Test reporting end to end** is the check the catalog cannot do for you. It creates a sandbox post, files a report as one persona, resolves it with `quarantine` as a moderator, and then looks again as a third — asserting that the post is hidden from a member and still visible to a moderator. Fixtures are deleted afterwards whether or not the assertions held.

Quarantine is the only moderation outcome whose effect lives in _your_ read policies rather than the platform's, so it is the only one that can be wired up wrong while everything appears to work: the platform records the decision, sets the column, and has no way to notice nobody reads it. Running this against your own app is the only proof.

### Things still worth checking by hand

- **Does a ban stop writes?** Suspend a persona, then try to write as them.
- **What does someone else see?** Sign in as a different seeded persona. You are always Root on your own instance, so clicking around never denies you anything — switching personas is the only way to encounter a permission boundary.

### The console

Reports are worked in the console at `/console/moderation`, which is the report queue and nothing else — each report shows its reason and content type inline. To work on the console itself, run it against your own stack:

```bash
pnpm --filter platform dev:local
```

The five Discord and GitHub variables in `.env.example` are validated at boot but unused by these pages, so any non-empty placeholder will do unless you are working on Discord or GitHub sync.

There is nothing to configure and no page that configures it. Reasons are a platform-owned enum set by migration, and content types are derived from each app's own schema, so `/tools/moderation` and `/tools/feedback` are gone — `pnpm devtools catalog` is how you read either one on any instance.

## Where the moderation decision lives

The **decision** is `platform."reportResolutions"` — the audit record, platform-owned, never lost. The **effect** is `"quarantinedBy"` on your own table, a foreign key pointing back at the decision that caused it.

Keeping the effect local is deliberate. Your app has to add a predicate to its read policies either way, so moving the state into `platform` would relocate the "silently missed" risk rather than removing it — while costing a partial index on the hot read path (`where "quarantinedBy" is null`) and turning every listing into a cross-schema anti-join. A local column also lets you express more than hiding: showing the author "removed by moderators", restoring, keeping something out of public lists but inside their own drafts.

`on delete set null` means deleting a decision un-quarantines automatically, and the column carries its own provenance — "why is this hidden?" is a join, not a guess.

## Related

- [The sandbox app](/docs/platform/sandbox-app) — the reference implementation, and the traps integration hides
- [Database & migrations](/docs/platform/database) — SQL is the source of truth; Drizzle types are generated from it
- [OAuth setup](/docs/platform/oauth-setup) — how a sibling project gets **Sign in with DevDogs**
