---
name: Monorepo
description: Setup, conventions, and the shared stack.
order: 0
---

# Monorepo

Every DevDogs project lives in one pnpm + Turborepo monorepo: four apps, eight shared packages, and one Supabase Postgres database they all talk to. Read this if you have just cloned the repo, or if you need to know which project owns what. If you already know which app you are working on, skip straight to that project's own docs at the bottom of this page.

## The four apps

Most contributors join one of the first two — **Schedule Builder** (Next.js) or **Study Group Finder** (Flutter). **Platform** is shared infrastructure the other apps depend on: it runs the OAuth server everyone signs in through. **Sandbox** is a dormant vestige — it used to proxy each competition team's own Supabase project, but that integration was removed and the platform no longer provisions or talks to it. You'll read about platform, but you'll rarely edit it; sandbox you can mostly ignore.

| Directory                 | What it is                                                              | Postgres schema      |
| ------------------------- | ----------------------------------------------------------------------- | -------------------- |
| `apps/schedule-builder`   | Next.js — course schedule planning ("DogDays")                          | `schedule_builder`   |
| `apps/study-group-finder` | Flutter — study groups ("Dog Pack"), still a scaffold                   | `study_group_finder` |
| `apps/platform`           | Next.js — shared OAuth server, plus the DevDogs site, console, and docs | `platform`           |
| `apps/sandbox`            | Cloudflare Worker — dormant; used to proxy each team's Supabase project | none                 |

Schema-per-app is an organizational boundary, not a security one. Every schema is reachable through the same PostgREST endpoint and the same publishable key, so Row-Level Security is what actually isolates one app's data from another's.

`packages/` holds what they share: the Supabase client factories, the env registry behind `with-env`, the `pnpm devtools` CLI, the docs compiler, Drizzle helpers, email templates, the Airtable registry, and the shared tsconfig/eslint/vitest presets.

The SQL is not in `packages/`. All three schemas are built by one migration history at the repo root — `supabase/migrations/` — with `supabase/config.toml` and `supabase/seed/` beside it.

## Start here

- [Quickstart](/docs/monorepo/guides/quickstart) — clone to a running app
- [Contributing](/docs/monorepo/guides/contributing) — branch, pull request, and the checks CI runs
- [Secrets and environments](/docs/monorepo/guides/secrets) — which env file is which, and who holds it
- [Stack](/docs/monorepo/stack) — every technology, its pinned version, and where our use departs from the defaults

## The projects

[Schedule Builder](/docs/schedule-builder) · [Study Group Finder](/docs/study-group-finder) · [Platform](/docs/platform) · [Sandbox](/docs/sandbox) · [Toolkit](/docs/toolkit), the shared packages.
