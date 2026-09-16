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

The database lifecycle used to live here as package scripts — `start-local-stack`,
`link-remote-project`, `push-migrations` and the two `reset-*-database` scripts —
which `pnpm devtools` shelled out to by name. It no longer does: devtools drives
the Supabase CLI directly (see `link`, `push`, `reset` in the
[database guide](../../docs/toolkit/guides/database.md)), so those scripts are
gone and this package's only scripts are the standard `build`/`typecheck`/`test`
lifecycle plus `test:rls`. That last one is the RLS suite, run directly
(`pnpm --filter @devdogsuga/supabase test:rls`) and in CI, with no `pnpm devtools`
verb behind it.

[API reference](https://devdogsuga.org/docs/toolkit/reference/api/supabase) ·
[Database](../../docs/platform/guides/database.md)
