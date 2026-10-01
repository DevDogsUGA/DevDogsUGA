---
name: Database (Drizzle)
description: Drizzle 1.0.0-rc.4 as a typed reader over a database whose schema is owned by SQL migrations, plus the connection settings the Supabase pooler forces.
order: 4
section: guides
mount: [schedule-builder, platform, toolkit]
---

# Database (Drizzle)

`drizzle-orm` and `drizzle-kit` 1.0.0-rc.4, on the `postgres` (postgres-js) driver 3.4.9, used for server-side SQL in both Next apps. The one thing to understand before touching it: **Drizzle does not own the schema here.** SQL migrations under `supabase/migrations` do. Read this before adding a table; [Drizzle's docs](https://orm.drizzle.team) cover the query builder itself.

`@devdogsuga/db`'s `/server` subpath is the shared client factory both apps build on — one relevant export, merged with the Supabase client factories in the Backstage cutover. `createDb(url, relations)` builds the postgres-js connection and wraps it in Drizzle:

```ts
import { createDb } from "@devdogsuga/db/server";
import { env } from "~/env";
import { relations } from "./relations";

export const db = createDb(env.DB_URL, relations);
```

Each app passes **its own** generated `relations`, because the two apps introspect different Postgres schemas and their generated modules are not interchangeable. `drizzle-orm` and `postgres` are peer dependencies — `@devdogsuga/db` brings neither version with it, so an app pins them. The full surface is documented in [`@devdogsuga/db`](https://github.com/DevDogsUGA/Backstage/tree/main/packages/db) — it ships from Backstage now, so there is no local `reference/api` page for it (the same as `config`, `env`, and the rest of the Backstage-sourced packages).

Both packages are pinned to an exact version rather than a range, because the `latest` dist-tag still points at 0.45.x and a range would silently downgrade them.

## Introspected, never pushed

Both apps follow the same workflow: SQL migrations own the schema, and `pnpm -F <app> types:drizzle` (`platform` or `schedule-builder`) pulls the live database back into Drizzle. No script here runs `drizzle-kit push`, and neither app hand-declares its own tables or policies in Drizzle — `src/server/db/schema/generated/schema.ts` is written entirely by that command and never edited by hand.

`types:drizzle` runs two `drizzle-kit pull`s per app — `drizzle-introspection.config.ts` (every schema this app doesn't own, into `src/supabase/drizzle/`) and `drizzle.config.ts` (the app's own schema, into `src/server/db/schema/generated/`) — then applies the fixups covered below. See [Writing a migration](/docs/platform/guides/migrations) for the full change loop: writing the migration, replaying it, and re-introspecting.

`src/server/db/relations.ts` is the one hand-maintained file next to the generated schema — a `defineRelations` call over the generated tables. The two apps introspect different schemas, so neither app's generated module or relations file is interchangeable with the other's.

## The connection settings are not optional

`@devdogsuga/db`'s `/server` subpath exports one `createDb(url, relations)` factory so these can only be configured one way:

- **`prepare: false`** — the apps connect through Supabase's transaction-mode pooler, which hands a different backend to each transaction and so cannot keep a named prepared statement alive between them.
- **Connections are cached on `globalThis`, keyed by URL.** An unkeyed slot would let a second caller inherit the first caller's connection, including its database. Caching defaults on outside production, where the module graph is built once anyway.

> [!IMPORTANT]
> Point `DB_URL` at the **Session pooler** (port 5432), not the Transaction pooler. `drizzle-kit` uses prepared statements, and against the transaction pooler it hangs rather than erroring.

<details>
<summary>Why does each app have two drizzle-kit configs?</summary>

`drizzle.config.ts` introspects the app's own schema (`platform`, or `schedule_builder`) into `src/server/db/schema/generated`. `drizzle-introspection.config.ts` introspects everything else — `["*", "!<own schema>", "!public", "!_*"]` — into `src/supabase/drizzle`, which is how each app reaches the Supabase-managed `auth` and `storage` schemas (and, for the console, the other app's schema too).

Any other app's schema that adds a quarantine column **must be excluded from that second filter**. A foreign key to `platform."reportResolutions"` makes Drizzle emit a reference it has no import for, so the generated file does not compile, and importing across would make the two generated modules circular. Nothing is lost by excluding one: apps reach their own content over PostgREST.

`scripts/drizzle-pull.ts` (the script behind `types:drizzle`) then repairs what drizzle-kit cannot do itself — it deletes the emitted `relations.ts` (relations are hand-maintained in `src/server/db/relations.ts`), re-injects any cross-schema import the app's own schema needs (platform's does, for `auth.users`/`auth.oauth_clients`; schedule-builder's doesn't, since `schedule_builder` carries no foreign keys into another schema), and aliases the `In<Schema>` suffix drizzle-kit adds for non-public schemas so each app's existing imports stay stable.

</details>
