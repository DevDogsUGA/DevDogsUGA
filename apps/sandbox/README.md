# sandbox

The per-environment proxy Worker sitting in front of each team's Supabase
project. Every request to a competition team's own instance arrives here; the
Worker asks the platform database who the caller's token belongs to, then
forwards to that team's upstream.

It owns **no Postgres schema** in the shared database — every schema there
belongs to one of the other three apps.

## Develop

```bash
pnpm dev --filter sandbox   # wrangler dev, against the local Supabase stack
```

Monorepo setup, env handling, and the contribution flow:
[Monorepo](../../docs/monorepo/index.md).

## Docs

[Sandbox](../../docs/sandbox/index.md) — where an instance comes from, what the
proxy does per request, and who may reach it.
