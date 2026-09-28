---
name: Platform
description: The site, console, docs, and OAuth server.
order: 10
---

# Platform

`apps/platform` is the Next.js app behind the DevDogs site: the public pages, the officer console, these docs, and the OAuth server sibling projects sign in against. Read a guide here when you are working on one of its subsystems.

> [!TIP]
> New here? Start at [Getting started](/docs/platform/getting-started/prerequisites) — installing the toolchain, a database, and running the app.

## Architecture, briefly

One Next.js app on Cloudflare Workers (vinext, not OpenNext), owning the
`platform` schema in the shared Supabase project. It is the only app that
talks to GitHub — provisioning teams, granting branch access, mirroring
competitions — through the GitHub App in [Identity](/docs/platform/guides/identity), documented in [Toolkit](/docs/toolkit/infrastructure/github-app).
Sibling apps never call GitHub or the shared database directly; they can let
a member sign in with their DevDogs account through the OAuth server this app
also runs — see [Getting started: Running](/docs/platform/getting-started/running).

## Glossary

- **Team** — a persistent group, not per-competition. See [Teams](/docs/platform/guides/meetings-and-teams/teams).
- **Competition** — a labeled GitHub issue, mirrored into a private Project; entering is opening a linked pull request, merging it is winning. See [Competitions](/docs/platform/guides/meetings-and-teams/competitions).
- **Meeting** — a general body meeting or workshop, authored as config in Backstage and reconciled here. See [Events](/docs/platform/infrastructure/events).
- **Attendance** — a member's authoritative meeting check-in, the input every star and streak derives from. See [Attendance](/docs/platform/guides/meetings-and-teams/attendance).
- **Star / streak** — a derived participation passport, not a stored score: one per credit-eligible meeting attended, one per competition entered, decorated by a win. See [Stars & Streaks](/docs/platform/guides/meetings-and-teams/stars-and-awards).
- **Moderation report** — a complaint against member-written content, resolved into a quarantine or a sanction. See [Reporting](/docs/platform/guides/reporting) and [Moderation](/docs/platform/guides/moderation).

## Guides

[Where things live](/docs/platform/guides/where-things-live) for a path table, [Testing](/docs/platform/guides/testing) for the suites, and [Meetings & Teams](/docs/platform/guides/meetings-and-teams), [Reporting](/docs/platform/guides/reporting), [Moderation](/docs/platform/guides/moderation), and [Navigation](/docs/platform/guides/navigation) for the domain model and the contracts other apps build against.

## Infrastructure

Maintainer and officer-only material: [Identity](/docs/platform/guides/identity) (the OAuth server), [Writing a migration](/docs/platform/guides/migrations) (the migration loop), and [Events](/docs/platform/infrastructure/events) (club config).
