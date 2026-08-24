---
name: Reporting
description: The contract a DevDogs app calls to let a member report content — three functions in the platform schema, what filing one does, and what the reporter is told back.
order: 1
---

# Reporting

Every DevDogs app shares one Supabase project, with a Postgres schema per app, so reporting is not an HTTP API and there is no SDK that owns it. **The contract is three `platform` functions plus the row-level security around them**, reached over PostgREST. TypeScript and Dart call the same functions with the same arguments.

Read this before adding a "Report" affordance anywhere. If what you need is to make one of your own tables reportable, that is [Moderation](/docs/platform/guides/moderation) instead. If you already know the contract, skip to [Integrating an app](/docs/platform/guides/reporting/integrating).

## Three surfaces

| Surface                                         | Who uses it         | What it is                                                                   |
| ----------------------------------------------- | ------------------- | ---------------------------------------------------------------------------- |
| `platform` RPCs                                 | consumer apps       | the public contract: file a report, read the reasons, read your own outcomes |
| `platform` tables                               | the DevDogs console | the queue, resolutions and audit log, read server-side under RLS             |
| a foreign key to `platform."reportResolutions"` | app migrations      | how a table declares itself moderatable                                      |

Consumer apps never touch `platform` tables directly. That split is what keeps the public surface narrow enough to change without breaking apps.

## The contract

All three live in the `platform` schema. They are set-returning, so **every result is a JSON array** — including the one that logically returns a single object. `file_report` comes back as `[{ reportId, corroborated }]`; use `.single()` or `[0]`.

| Function              | Arguments                                                          | Returns                            |
| --------------------- | ------------------------------------------------------------------ | ---------------------------------- |
| `list_report_reasons` | none                                                               | `[{ reason, title, description }]` |
| `file_report`         | `app_slug`, `content_type`, `content_ref`, `reason`, `description` | `{ reportId, corroborated }`       |
| `my_reports`          | `app_slug`, `since`, `only_open`                                   | the caller's own reports           |

`only_open` is `null` for every report, `true` for open ones, `false` for decided ones. `app_slug` is the app's slug in `platform."apps"` — **not** an OAuth client id; which app this is and which client signed the user in are deliberately separate questions.

Reasons are one global enum, `platform."reportReason"`, so `file_report` takes a label rather than a uuid: a client can hardcode one and a test can fixture one. Titles and display order live in `platform."reportReasons"`, keyed by the enum, so re-wording a reason applies retroactively — `my_reports` returns the label and the client renders the current title. **`other` requires a description**, enforced inside `file_report` so it holds for Dart and TypeScript alike.

<details>
<summary>Which reasons ship, and how do I add one?</summary>

The database is the source of truth; `pnpm devtools catalog` prints what an instance actually has. As of `20260807000000_platform_report_reasons_enum.sql`, in display order:

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

Order comes from a `position` column rather than from sorting by title, which is what keeps "Something else" at the end.

**Adding one takes two migrations.** `alter type ... add value` cannot be used in the transaction that adds it, so the label lands in one file and its `reportReasons` row in the next. A test in `packages/supabase/testing/moderation.test.ts` compares `enum_range()` against the table, so writing only the first file fails CI instead of shipping a reason `file_report` accepts and `list_report_reasons` never returns.

</details>

## Why RPCs rather than direct table writes

Three independent reasons, any one of which would be sufficient.

**Server-side truth.** A client filing a report knows the content reference and the reason. It does _not_ legitimately know who authored the content or what it said — those must come from the content itself, or a tampered client can attribute content to the wrong user and hand moderators fabricated evidence. The signature accepts only what the caller legitimately knows.

**Server-side decisions.** Corroboration, rate limiting and snapshotting are decisions, not inserts.

**Flutter.** `supadart` reads only PostgREST's _default_ schema, which is `study_group_finder` — `config.toml` lists it first for exactly that reason. The Flutter app will therefore never have generated Dart models for `platform` tables, and an RPC needs none. Reads are RPCs for that reason too.

<details>
<summary>Why do these return <code>table (...)</code> rather than <code>jsonb</code>?</summary>

They used to return `jsonb`, on the grounds that a jsonb result was what made them language-neutral. That was wrong, and it is worth recording so it is not reintroduced.

PostgREST publishes **no response schema for any RPC** — `{"200": {"description": "OK"}}`, identically for a `jsonb` function and for one returning a table — so supadart could never have typed the results either way, and it does not read the `platform` schema at all. Meanwhile `supabase gen types` reads the _catalog_, so `returns table (...)` gives TypeScript every column name and type. The jsonb form was costing return types and buying nothing.

</details>

## What filing one does

```
 platform.file_report(...)
   ├─ refuses a suspended account, a test identity, or an 11th report this hour
   ├─ resolves the content → raises if it does not exist
   ├─ fills the reported user and the snapshot FROM THE SOURCE TABLE
   └─ already an open report on this content? → records a corroboration instead
        ▼
 platform.reports (status = 'open')
        ▼
 a moderator resolves it, in one transaction:
   reports.status = 'resolved' · a reportResolutions row ·
   apply_content_action(...) → sets your table's "quarantinedBy" ·
   any suspension → platform.userSuspensions
        ▼
 the effects are already live: quarantined content behaves as YOUR policies
 say, and a suspended member cannot write anywhere, because every app's write
 policies call platform.is_suspended()
```

There is no delivery step anywhere in that path, so there is nothing to retry, sign, back off or reconcile. The snapshot is **frozen at filing time**, so a moderator reviews what was actually reported even if the content is edited or deleted afterwards.

## What a reporter is told

`my_reports` returns a coarse `outcome` — `action_taken`, `no_violation` or `dismissed`, and null while the report is open — plus `contentRemoved`. A reporter never learns what happened to the other member: another member's standing is not their business, and the console has the full record for anyone entitled to it. `moderatorNote` is internal and is never returned.

The `snapshot` comes back only for content types marked `public`. Visibility defaults to `restricted`, so forgetting to configure it can never turn reporting into a disclosure oracle for private content.
