# sandbox

A dormant Cloudflare Worker. It used to proxy each competition team's own
Supabase project; that integration was removed in the platform redesign, and
nothing provisions, credentials or deploys it any more. The code stays in case
the design is revisited. Run today, it refuses every request.

It owns **no Postgres schema** in the shared database.

## Develop

```bash
pnpm dev --filter sandbox   # wrangler dev
```

## Docs

[Sandbox](../../docs/sandbox/index.md) — what the Worker used to do, kept as
history.
