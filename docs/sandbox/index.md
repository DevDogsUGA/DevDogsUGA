---
name: Sandbox
description: A dormant Worker; the platform no longer provisions or talks to it.
order: 20
---

# Sandbox

`apps/sandbox` used to be a Cloudflare Worker proxying each competition team's
own Supabase project, provisioned and credentialed by the platform. That
integration was removed as part of the platform redesign: the platform no
longer creates, credentials, pauses or tears down a team's Supabase project,
and nothing on the platform side mints a token for this Worker to authenticate
with.

The Worker's own code is still in the repository, dormant — a vestige, not
deleted, in case the design is revisited. It is not deployed by CI and holds
no working credential, so running it today answers every request the way its
own `src/index.ts` answers a missing binding: a refusal, not a crash.

> [!NOTE]
> "Sandbox environment" in the guides below (kept for anyone reading the
> Worker's source) means a team's own Supabase instance, the thing this
> integration used to manage. It is unrelated to the `sandbox` Postgres
> schema, which is fixture content for the moderation tooling.

## What's here

- **[Lifecycle](./guides/lifecycle)** and **[Access](./guides/access)**
  describe the removed platform-side mechanics: where an instance used to come
  from, and how a member used to reach one. They are history now, not a guide
  to anything you can run.

There is no generated reference for this app any more — only shared packages
under [Toolkit](/docs/toolkit) get one. Read the Worker's own source in
`apps/sandbox/src` directly if you need it.
