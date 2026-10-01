# platform

The Next.js app behind the DevDogs site: the public pages, the officer console,
the rendered docs, and the OAuth server the sibling projects sign in against. It
owns the **`platform`** Postgres schema on the shared Supabase project
(`supabase/migrations/*_platform_*.sql`).

## Develop

```bash
pnpm -F platform dev   # local stack auto-detected, else the linked remote
```

Monorepo setup, env handling, and the contribution flow:
[Toolkit](../../docs/toolkit/index.md).

## Docs

[Platform](../../docs/platform/index.md) — a guide per subsystem, plus the
generated reference for every route, action, component and hook.
