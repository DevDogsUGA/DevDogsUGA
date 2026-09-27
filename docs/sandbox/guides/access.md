---
name: Access
description: The removed member-credential model, kept for context.
order: 3
section: guides
---

# Access

This page used to explain how a team member reached their team's sandbox
Supabase project: two opaque DevDogs tokens per member, issued through the
platform and presented to the proxy Worker instead of a real Supabase key. The
platform redesign removed the integration this depended on — see
[Lifecycle](/docs/sandbox/guides/lifecycle) for what came out. There is no
platform-side credential to issue any more, so linking a checkout to a team
environment is not something the platform can do today.

## What the old model was, briefly

A member's tokens identified them and the authority they were asking for
(client-safe publishable, or a secret key scoped to what they were allowed to
touch). Both routed through the proxy's hostname rather than Supabase's own,
so revoking a member's access — or the whole environment's — happened at the
proxy without touching the underlying project. Tokens were stored only as a
hash; a lost one was reissued, never recovered.

If that model is ever revisited, it lived in `apps/platform/src/server/
sandbox/` before this removal — `git log` on that path is the place to start,
not this page.
