---
name: Platform
description: The site, console, docs, and OAuth server.
order: 10
---

# Platform

`apps/platform` is the Next.js app behind the DevDogs site: the public pages, the officer console, these docs, and the OAuth server sibling projects sign in against. Read a guide here when you are working on one of its subsystems.

> [!TIP]
> New here? Start at [Getting started](/docs/platform/getting-started) — installing the toolchain, a database, and running the app. Just entering a feature competition, with no local setup? [Entering a competition](/docs/platform/getting-started/competition-entry) is the shorter path.

## Architecture, briefly

One Next.js app on Cloudflare Workers (vinext, not OpenNext), owning the
`platform` schema in the shared Supabase project. It is the only app that
talks to GitHub — provisioning teams, granting branch access, mirroring
competitions — through the GitHub App in [Identity](/docs/platform/guides/identity/github-app).
Sibling apps never call GitHub or the shared database directly; they can let
a member sign in with their DevDogs account through the OAuth server this app
also runs — see [Sign in with DevDogs](/docs/platform/guides/identity/oauth).

## Glossary

- **Team** — a persistent group, not per-competition. See [Teams](/docs/platform/guides/meetings-and-teams/teams).
- **Competition** — a labeled GitHub issue, mirrored into a private Project; entering is opening a linked pull request, merging it is winning. See [Competitions](/docs/platform/guides/meetings-and-teams/competitions).
- **Meeting** — a general body meeting or workshop, authored as config in Backstage and reconciled here. See [Events](/docs/platform/guides/meetings-and-teams/events).
- **Attendance** — a member's authoritative meeting check-in, the input every star and streak derives from. See [Attendance](/docs/platform/guides/meetings-and-teams/attendance).
- **Star / streak** — a derived participation passport, not a stored score: one per credit-eligible meeting attended, one per competition entered, decorated by a win. See [Stars & Streaks](/docs/platform/guides/meetings-and-teams/stars-and-awards).
- **Moderation report** — a complaint against member-written content, resolved into a quarantine or a sanction. See [Reporting](/docs/platform/guides/reporting) and [Moderation](/docs/platform/guides/moderation).

## Guides

[Meetings & Teams](/docs/platform/guides/meetings-and-teams), [Reporting](/docs/platform/guides/reporting), [Moderation](/docs/platform/guides/moderation), and [Navigation](/docs/platform/guides/navigation) — the domain model and the contracts other apps build against.

## Infrastructure

Maintainer and officer-only material: [Identity](/docs/platform/guides/identity) (the OAuth server and the GitHub App), [Database](/docs/platform/guides/database) (the migration loop), and [Events](/docs/platform/guides/meetings-and-teams/events) (club config).
