# platform

The Next.js app behind the DevDogs site: the public pages, the officer console,
the rendered docs, and the OAuth server the sibling projects sign in against. It
owns the **`platform`** Postgres schema on the shared Supabase project
(`supabase/migrations/*_platform_*.sql`).

## Develop

```bash
pnpm dev --filter platform   # local stack auto-detected, else the linked remote
```

Monorepo setup, env handling, and the contribution flow:
[Monorepo](../../docs/monorepo/index.md).

## Docs

[Platform](../../docs/platform/index.md) — a guide per subsystem, plus the
generated reference for every route, action, component and hook.
