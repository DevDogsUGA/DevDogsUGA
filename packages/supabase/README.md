# @devdogsuga/supabase

This repo's own Supabase data: the generated `Database` type, the canonical
app → Postgres schema map, and the RLS persona suite that exercises the real
schema against them.

The client factories that used to live here (`createBrowserClient`,
`createServerClient`, `createAdminClient`) moved to
[`@devdogsuga/db`](https://github.com/DevDogsUGA/Backstage/tree/main/packages/db)'s
`client`/`server` subpaths — they are generic framework code, not this repo's
data, and now ship from Backstage alongside the rest of the shared packages.
Import them from there and supply this package's `Database` type as the
generic argument:

```ts
import { createServerClient } from "@devdogsuga/db/client";
import { SCHEMAS } from "@devdogsuga/supabase";
import type { Database } from "@devdogsuga/supabase/types";

const supabase = createServerClient<Database, typeof SCHEMAS.platform>({
  url,
  key,
  schema: SCHEMAS.platform,
  cookies,
});
```

Each app binds `Database` once in its own `~/supabase/{client,server,admin}.ts`
wrapper rather than threading the type argument through every call site — see
those files for the concrete pattern.

The database lifecycle used to live here as package scripts — `start-local-stack`,
`link-remote-project`, `push-migrations` and the two `reset-*-database` scripts —
which `pnpm devtools` shelled out to by name. It no longer does: devtools drives
the Supabase CLI directly (see `link`, `push`, `reset` in the
[database guide](../../docs/toolkit/guides/database.md)), and regenerates
`database.types.ts` here via `@devdogsuga/db/typegen`. This package's own
scripts are the standard `build`/`typecheck`/`test` lifecycle plus `test:rls`.
That last one is the RLS suite, run directly
(`pnpm --filter @devdogsuga/supabase test:rls`) and in CI, with no `pnpm devtools`
verb behind it.

[API reference](https://devdogsuga.org/docs/toolkit/reference/api/supabase) ·
[Database](../../docs/platform/guides/database.md)
