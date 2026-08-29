---
name: Platform
description: The site, console, docs, and OAuth server.
order: 10
---

# Platform

`apps/platform` is the Next.js app behind the DevDogs site: the public pages, the officer console, these docs, and the OAuth server sibling projects sign in against. Read a guide here when you are working on one of its subsystems. If you are still getting the repository running, or want a technology's version and conventions, start at [Monorepo](/docs/monorepo) — nothing on this page repeats it.

## Guides

| Guide                                                        | What it covers                                                                    |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| [Meetings & Teams](/docs/platform/guides/meetings-and-teams) | Meetings, workshops, competitions, teams, attendance, stars, and awards           |
| [Elections](/docs/platform/guides/elections)                 | Ranked ballots over competing implementations, and how a competition is scored    |
| [Airtable](/docs/platform/guides/airtable)                   | The officer base, the field registry, and what syncs in which direction           |
| [Reporting](/docs/platform/guides/reporting)                 | The `platform` RPC contract every app calls to report content                     |
| [Moderation](/docs/platform/guides/moderation)               | How a table becomes reportable and quarantinable, and the traps that hides        |
| [Identity](/docs/platform/guides/identity)                   | Sign in with DevDogs, and the GitHub App the platform authenticates as            |
| [Database](/docs/platform/guides/database)                   | SQL migrations own the schema — the change loop, and how one reaches each project |
| [Navigation](/docs/platform/guides/navigation)               | The top nav, the docs sidebar, and permission-gated console items                 |

## Reference

[Platform reference](/docs/platform/reference) enumerates the app itself: every route and API route, the server actions, the components and hooks, and the Supabase surface. Those pages are generated from the source tree by `docs-build gen` and overwritten on every build, so a correction belongs in the doc comment it was read from, not in the page.
