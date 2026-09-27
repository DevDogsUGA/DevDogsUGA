---
name: supabase
description: Three client factories scoped to an app's schema, the generated Database types, and the RLS persona suite.
order: 6
section: guides
---

# supabase

`@devdogsuga/db` (`/client` and `/server` subpaths) is the client layer over
the one shared Supabase project — merged with the Drizzle factory in the
Backstage cutover, generic over a `Database` type the consumer supplies.
`@devdogsuga/supabase` keeps this repo's own data: the generated `Database`
type, the `SCHEMAS` app → schema map, and the RLS persona suite. Three
factories, and which one you call is the whole decision:

```ts
import { createServerClient } from "@devdogsuga/db/client";
import type { Database } from "@devdogsuga/supabase";
import { cookies } from "next/headers";

const cookieStore = await cookies();

const supabase = createServerClient<Database, typeof APP_SCHEMA>({
  url: env.API_URL,
  key: env.PUBLISHABLE_KEY,
  schema: APP_SCHEMA,
  cookies: {
    getAll: () => cookieStore.getAll(),
    setAll: (toSet) => {
      /* cookieStore.set each — ignored in a Server Component */
    },
  },
});
```

Each app binds `Database` once in its own `~/supabase/{client,server,admin}.ts`
wrapper rather than threading the type argument through every call site —
`createAdminClient` lives in `@devdogsuga/db/server` (server-only, behind
`import "server-only"`); `createBrowserClient`/`createServerClient` live in
`@devdogsuga/db/client`.

- **`createBrowserClient`** — the anon client. `@supabase/ssr` caches it in one
  module-level slot, first call wins, **arguments never compared** — so calling
  it twice with different schemas returns the first client pointed at the first
  schema, silently. Each app passes one constant, which is what makes that
  safe.
- **`createServerClient`** — cookie-backed, for RSCs, route handlers and server
  actions. You supply the framework's cookie adapter.
- **`createAdminClient`** — the service-role client. It **bypasses RLS**:
  server-only, never shipped to the browser, and session auto-refresh and
  persistence are off.

All three take `{ url, key, schema }`. `schema` becomes the client's default
for `.from()` — set it explicitly rather than relying on the endpoint's default
profile, which belongs to whichever schema is listed first in `config.toml`.

`SCHEMAS` is the canonical app → schema map (`platform`, `schedule_builder`,
`study_group_finder`). The generated `Database` types come from
`@devdogsuga/supabase/types` — regenerated via `@devdogsuga/db/typegen`'s
`generateDatabaseTypes`, wired up by `pnpm devtools db migrate` and
`pnpm devtools db reset` — never edited.

## Writing an RLS test

Schema isolation is organizational, not a security boundary — every schema is
reachable through the same PostgREST endpoint with the same publishable key, so
a missing predicate in a policy _is_ the vulnerability. `packages/supabase/testing`
is where that gets caught. Personas sign in for real with
`signInWithPassword` rather than using hand-signed JWTs, so what runs is the
token path production uses.

The suite needs the local stack and its credentials, which is why it is a
separate config and not part of `pnpm test`:

```bash
pnpm devtools db start
pnpm devtools db reset
pnpm --filter @devdogsuga/supabase test:rls
```

For policies, migrations and `config.toml`, read
[Supabase](/docs/platform/guides/stack/supabase). This repo's own exports (the
`Database` type, `SCHEMAS`) are in the generated
[`@devdogsuga/supabase`](/docs/toolkit/reference/api/supabase) reference; the
client/server factories are documented in
[`@devdogsuga/db`](https://github.com/DevDogsUGA/Backstage/tree/main/packages/db).
