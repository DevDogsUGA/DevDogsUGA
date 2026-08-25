# @devdogsuga/supabase

The shared Supabase surface: client factories, the generated `Database` types,
and the canonical app → Postgres schema map.

Every client is scoped to one schema at construction, so an app never has to
remember to pass `.schema()`:

```ts
import { createServerClient, SCHEMAS } from "@devdogsuga/supabase";

const supabase = createServerClient({
  url,
  key,
  schema: SCHEMAS.platform,
  cookies,
});
```

`createBrowserClient` and `createAdminClient` take the same options; the admin
one holds the service role and bypasses RLS, so it is server-only.

The package also owns the database scripts `pnpm sb` delegates to —
`start-local-stack`, `link-remote-project`, `push-migrations` and the two
`reset-*-database` scripts. `test:rls` is **not** among them: it is the RLS
test suite, run directly (`pnpm --filter @devdogsuga/supabase test:rls`) and in
CI, with no `pnpm sb` verb behind it.

[API reference](https://devdogsuga.org/docs/toolkit/reference/api/supabase) ·
[Database](../../docs/platform/guides/database.md)
