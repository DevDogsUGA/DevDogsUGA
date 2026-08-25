---
name: drizzle
description: One client factory shared by every Next app, so the pooler settings that are not optional can only be configured one way.
order: 5
---

# drizzle

`@devdogsuga/drizzle` exports one function. `createDb(url, relations)` builds
the postgres-js connection and wraps it in Drizzle:

```ts
import { createDb } from "@devdogsuga/drizzle";
import { env } from "~/env";
import { relations } from "./relations";

export const db = createDb(env.DB_URL, relations);
```

Each app passes **its own** generated `relations`, because the two apps
introspect different Postgres schemas and their generated modules are not
interchangeable. Everything else — driver, pooling behaviour, hot-reload
caching — lives in the factory so it can only be configured one way.

The setting that matters is `prepare: false`, and it is a requirement rather
than a preference: the apps connect through Supabase's transaction-mode pooler,
which hands a different backend to each transaction and therefore cannot keep a
named prepared statement alive between them.

Connections are cached on `globalThis`, keyed by URL, so Next's dev-server
module reloads reuse one pool instead of opening a new one per edit. The cache
is on by default outside production, where the module graph is built once and it
would only keep a reference alive; pass `{ cache: false }` to opt out anywhere.

`drizzle-orm` and `postgres` are peer dependencies — this package brings neither
version with it, so an app pins them.

Drizzle does not own the schema here; SQL migrations do, and no script in the
repo runs `drizzle-kit push`. That, the `db:pull` and `db:generate` scripts and
the `DB_URL` you want are all in [Drizzle](/docs/monorepo/stack/drizzle). The
full surface is the generated
[`@devdogsuga/drizzle`](/docs/toolkit/reference/api/drizzle) reference.
