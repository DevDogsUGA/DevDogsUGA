---
name: Sandbox
description: The per-team Supabase instance behind a proxy — how a competition team gets a database of its own, and what stands between it and the real one.
order: 20
---

# Sandbox

Every competition team gets its own Supabase project, reached through a proxy
that the platform owns. This section is about that machinery: where an instance
comes from, who may reach it, and what happens to it when the competition ends.

It is a separate deployable — `apps/sandbox`, a Cloudflare Worker — not a corner
of the platform app, which is why it has its own section rather than a heading
inside one.

> [!NOTE]
> "Sandbox environment" here means a team's own Supabase instance. It is
> unrelated to the `sandbox` Postgres schema, which is fixture content for the
> moderation tooling.

## Start here

- **[Lifecycle](./guides/lifecycle)** — where an instance comes from, pausing to
  free a slot, and end of life.
- **[The proxy](./guides/proxy)** — one hostname per environment, and what the
  Worker does per request.
- **[Access](./guides/access)** — tokens per member, why authority follows the
  credential, and how revocation works.

## Reference

[Reference](./reference/src) is generated from the Worker's source on every
build. It is exhaustive where the guides are selective — reach for it when you
need an exact signature.
