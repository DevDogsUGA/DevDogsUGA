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

The database lifecycle used to live here as package scripts, then in a `db`
namespace of `pnpm devtools`. Neither remains: use `pnpm devtools supabase …`
(the Supabase CLI with the session's tier filled in) and `preset
apply-migrations`. This package's own scripts are the standard
`typecheck`/`test` lifecycle, `types:db` (regenerates `database.types.ts`;
`types:db:check` fails on drift) and `test:rls`, the RLS suite
(`pnpm -F @devdogsuga/supabase test:rls`), which has no `pnpm devtools` verb
behind it.

[API reference](https://devdogsuga.org/docs/toolkit/reference/api/supabase) ·
[Database](../../docs/platform/guides/database.md)
