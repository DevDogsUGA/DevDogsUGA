---
name: Lifecycle
description: The removed team-sandbox provisioning model, kept for context.
order: 1
section: guides
---

# Lifecycle

This page used to explain where a team's sandbox Supabase project came from,
who owned it, and the three ways it ended. The platform redesign removed that
entire integration: `provisionEnvironment`, the Supabase OAuth connect flow,
the `sandboxEnvironments` / `teamEnvironments` / `sandboxCredentials` tables,
and the nightly reconcile/pause/prewarm passes are all gone from
`apps/platform`. Nothing in the platform provisions, pauses, or tears down a
Supabase project on a team's behalf any more.

## What the old model was, briefly

Each team's lead connected their own free Supabase account through OAuth. The
platform created a project on their behalf, tracked it as an "environment" a
team attached to, and ran background passes to pause idle projects (freeing
the lead's two-project free-tier cap) and restore ones a competition was about
to need. Ending an environment meant detaching (reusable), revoking
(deliberate teardown), or orphaning (the upstream project vanished).

If that model is ever revisited, it lived in `apps/platform/src/server/
supabase/` and `apps/platform/src/server/sandbox/` before this removal — `git
log` on those paths is the place to start, not this page.
