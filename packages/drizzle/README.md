# @devdogsuga/drizzle

The shared postgres-js + Drizzle client factory used by every Next app.

One call, and the app supplies only what is genuinely its own — the connection
URL and its generated relations:

```ts
import { createDb } from "@devdogsuga/drizzle";

export const db = createDb(env.DB_URL, relations);
```

Driver options, pooling and the hot-reload connection cache live in the factory
so they can only be configured one way. `prepare: false` is required rather than
preferred: the apps connect through Supabase's transaction-mode pooler, which
cannot keep a named prepared statement alive across transactions.

[API reference](https://devdogsuga.org/docs/toolkit/reference/api/drizzle) ·
[Drizzle](../../docs/monorepo/stack/drizzle.md)
