---
name: Monorepo
description: Setup, conventions, and the shared stack.
order: 0
---

# Monorepo

Every DevDogs project lives in one pnpm + Turborepo monorepo: four apps, eight shared packages, and one Supabase Postgres database they all talk to. Read this if you have just cloned the repo, or if you need to know which project owns what. If you already know which app you are working on, skip straight to that project's own docs at the bottom of this page.

## The four apps

| Directory                 | What it is                                                             | Postgres schema      |
| ------------------------- | ---------------------------------------------------------------------- | -------------------- |
| `apps/platform`           | Next.js — the DevDogs site, console, docs, and OAuth server            | `platform`           |
| `apps/schedule-builder`   | Next.js — course schedule planning                                     | `schedule_builder`   |
| `apps/study-group-finder` | Flutter — study groups, still a scaffold                               | `study_group_finder` |
| `apps/sandbox`            | Cloudflare Worker — the proxy in front of each team's Supabase project | none                 |

Schema-per-app is an organizational boundary, not a security one. Every schema is reachable through the same PostgREST endpoint and the same publishable key, so Row-Level Security is what actually isolates one app's data from another's.

`packages/` holds what they share: the Supabase client factories, the env registry behind `with-env`, the `pnpm devtools` CLI, the docs compiler, Drizzle helpers, email templates, the Airtable registry, and the shared tsconfig/eslint/vitest presets.

The SQL is not in `packages/`. All three schemas are built by one migration history at the repo root — `supabase/migrations/` — with `supabase/config.toml` and `supabase/seed/` beside it.

## Start here

- [Quickstart](/docs/monorepo/guides/quickstart) — clone to a running app
- [Contributing](/docs/monorepo/guides/contributing) — branch, pull request, and the checks CI runs
- [Secrets and environments](/docs/monorepo/guides/secrets) — which env file is which, and who holds it
- [Stack](/docs/monorepo/stack) — every technology, its pinned version, and where our use departs from the defaults

## The projects

[Platform](/docs/platform) · [Schedule Builder](/docs/schedule-builder) · [Study Group Finder](/docs/study-group-finder) · [Sandbox](/docs/sandbox) · [Toolkit](/docs/toolkit), the shared packages.
