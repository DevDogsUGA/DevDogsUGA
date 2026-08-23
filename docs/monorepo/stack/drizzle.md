---
name: Drizzle
description: Drizzle 1.0.0-rc.4 as a typed reader over a database whose schema is owned by SQL migrations, plus the connection settings the Supabase pooler forces.
order: 4
---

# Drizzle

`drizzle-orm` and `drizzle-kit` 1.0.0-rc.4, on the `postgres` (postgres-js) driver 3.4.9, used for server-side SQL in both Next apps. The one thing to understand before touching it: **Drizzle does not own the schema here.** SQL migrations under `supabase/migrations` do. Read this before running a `db:` script or adding a table; [Drizzle's docs](https://orm.drizzle.team) cover the query builder itself.

Both packages are pinned to an exact version rather than a range, because the `latest` dist-tag still points at 0.45.x and a range would silently downgrade them.

## Generated, never pushed

No script here runs `drizzle-kit push`. Every `db:` script either introspects the live database or drafts SQL from a schema:

| App                | Script        | What it does                                                                                                                          |
| ------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `platform`         | `db:pull`     | introspects the live database into `src/server/db/schema/generated` and `src/supabase/drizzle`                                        |
| `schedule-builder` | `db:generate` | drafts SQL from the Drizzle schema into `drizzle-generated/`, to be carried by hand into a real migration                             |
| `schedule-builder` | `db:pull`     | introspects every schema **except** `schedule_builder` into `src/supabase/drizzle` — the Supabase-managed schemas, not this app's own |

A `db:generate` draft is never the migration. Someone moves it into `supabase/migrations`, which stays the source of truth.

`schedule-builder`'s own Drizzle schema is **hand-written** — `src/server/db/schema/schedule-builder.ts`, `pgSchema("schedule_builder")` tables — and is the input to `db:generate`, not an output of `db:pull`. Its `db:pull` filter excludes that schema on purpose, so nothing brings those tables back from the database.

## The connection settings are not optional

`@devdogsuga/drizzle` exports one `createDb(url, relations)` factory so these can only be configured one way:

- **`prepare: false`** — the apps connect through Supabase's transaction-mode pooler, which hands a different backend to each transaction and so cannot keep a named prepared statement alive between them.
- **Connections are cached on `globalThis`, keyed by URL.** An unkeyed slot would let a second caller inherit the first caller's connection, including its database. Caching defaults on outside production, where the module graph is built once anyway.

Each app passes its own `relations`. That file is the hand-maintained half: `src/server/db/schema/generated/` is introspected from the live database and never edited, while `src/server/db/relations.ts` is written by hand — a `defineRelations` call over those generated tables. The two apps introspect different schemas, so neither module is interchangeable with the other's.

> [!IMPORTANT]
> Point `DB_URL` at the **session** pooler (port 5432), not the transaction pooler. `drizzle-kit` uses prepared statements, and against the transaction pooler it hangs rather than erroring.

<details>
<summary>Why does the platform have two drizzle-kit configs?</summary>

`drizzle.config.ts` introspects the `platform` schema into `src/server/db/schema/generated`. `drizzle-introspection.config.ts` introspects everything else — `["*", "!platform", "!public", "!_*"]` — into `src/supabase/drizzle`, which is how the console reaches the Supabase-managed `auth` and `storage` schemas.

Any other app's schema that adds a quarantine column **must be excluded from that second filter**. A foreign key to `platform."reportResolutions"` makes Drizzle emit a reference it has no import for, so the generated file does not compile, and importing across would make the two generated modules circular. Nothing is lost by excluding one: apps reach their own content over PostgREST.

`scripts/post-pull.ts` then repairs what drizzle-kit cannot do itself — it deletes the emitted `relations.ts` (relations are hand-maintained in `src/server/db/relations.ts`), re-injects the cross-schema import for `auth.users` and `auth.oauth_clients`, and aliases the `InPlatform` suffix drizzle-kit adds for non-public schemas so the app's imports stay stable.

</details>
