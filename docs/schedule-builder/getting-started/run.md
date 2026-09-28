---
name: Run the app
description: Starting schedule-builder itself once your toolchain, database, and sign-in are set up.
order: 5
section: getting-started
---

# Run the app

This assumes the toolchain, database, and sign-in steps earlier in
[Getting started](/docs/schedule-builder/getting-started) are done.

## Start it

```bash
pnpm dev --filter schedule-builder
```

`dev` is `with-env next dev` — it reads the shared root `.env` (and
`.env.generated`, when a local Supabase stack is running) before Turbopack
starts. Local dev runs on the standard Next.js dev server, not vinext —
builds and deploys still go through `vinext build` / `wrangler dev` (see
[Local setup](/docs/schedule-builder/guides/local-setup)). The app serves on
**port 3001** (`platform` takes 3000, so both can run together). Going
through the `devtools run` picker (`pnpm dev --filter …`) rather than
`pnpm --filter schedule-builder dev` also builds this app's workspace
dependencies first — see
[Contributing](/docs/schedule-builder/guides/contributing).

## Sign-in needs the platform

This app has no user store of its own. In development it authenticates against
the platform's OAuth server (`custom:devdogsuga`); in production it uses Google,
restricted to `hd: uga.edu`. Any signed-in flow needs the platform's OAuth
server reachable, which is why sign-in setup comes before this step. Browsing
signed out works fine without it — a visitor's drafts live in `localStorage`
until they sign in.

## Populate course data

A fresh database has no courses, so there is nothing for the generator to plan
against yet. Trigger the registrar scrape through devtools — it starts a
temporary local Wrangler session (the Workflow runtime `next dev` doesn't
provide on its own), runs the scrape against your database, and waits for it
to finish:

```bash
pnpm devtools workflows run --app schedule-builder --tier development
```

This can take a while on a first run — it pulls every available term. See
[Ingestion](/docs/schedule-builder/guides/ingestion) for what it's actually
doing, and a faster non-interactive form.

## Next

[Doctor](/docs/schedule-builder/getting-started/doctor) checks all of this against
your machine. Once the app is up, [Your first feature](/docs/schedule-builder/getting-started/first-feature)
walks a real change end to end.
