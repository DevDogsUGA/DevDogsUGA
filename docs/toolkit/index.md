---
name: Shared packages & tooling
description: The shared packages every app builds on, and the repo-wide maintainer material — CI, deploys, secrets, the docs system.
order: 50
---

# Shared packages & tooling

Two things live here: reference-shaped guides to the packages under `packages/*` and the Backstage-published `@devdogsuga/*` tooling every app shares — you meet one because you hit an import or ran a command — and, under **Infrastructure**, the maintainer/officer-only material that spans the whole repo: deploys, secrets, CI, the docs system.

## Which app owns what

| Directory                 | What it is                                                              | Postgres schema      |
| ------------------------- | ----------------------------------------------------------------------- | -------------------- |
| `apps/schedule-builder`   | Next.js — course schedule planning ("DogDays")                          | `schedule_builder`   |
| `apps/study-group-finder` | Flutter — study groups ("Dog Pack"), still a scaffold                   | `study_group_finder` |
| `apps/platform`           | Next.js — shared OAuth server, plus the DevDogs site, console, and docs | `platform`           |

Schema-per-app is an organizational boundary, not a security one — see [Supabase](../_shared/guides/stack/supabase.md?project=platform) for why Row-Level Security is what actually isolates one app's data from another's. The SQL is not in `packages/`: all three schemas are built by one migration history at the repo root, `supabase/migrations/`.

## I need to…

| …do this                             | …use this                                                                                                                                                              |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Read a variable, or add a new one    | [**`@devdogsuga/env`**](./guides/env/index.md) — one declaration per variable                                                                                          |
| Find the command for a chore         | [**`@devdogsuga/devtools`**](./guides/devtools.md) — the contributor CLI                                                                                               |
| Boot, migrate or reset a database    | [**Running the database**](./guides/devtools-db.md) — `devtools supabase …`, `apply-migrations`, `restart-stack`                                                       |
| Talk to Postgres from an app         | [**`@devdogsuga/db`**](../_shared/guides/stack/db.md) — the shared postgres-js + Drizzle client factory                                                                |
| Reach Supabase, or write an RLS test | [**`@devdogsuga/db`** + `@devdogsuga/supabase`](../_shared/guides/stack/supabase.md) — client factories, types, RLS suite                                              |
| Author a meeting or a workshop       | [**`@devdogsuga/events`**](../platform/infrastructure/events.md) — a PR against Backstage's data                                                                       |
| Send an email                        | [**`@devdogsuga/email`**](./guides/email.md) — react-email, compiled to typed HTML                                                                                     |
| Change how docs are built            | [**`@devdogsuga/docs-kit`**](./guides/docs-kit.md) — compiles markdown, generates reference                                                                            |
| Deploy, rotate a secret, add an app  | **Infrastructure**, below — [Cloudflare](./infrastructure/cloudflare.md), [Secrets](./infrastructure/secrets.md), [Docs system](./infrastructure/docs-system/index.md) |

<details>
<summary>Every pinned version, and what departs from the default</summary>

Shared versions live in the `catalog:` block of `pnpm-workspace.yaml`.

| Layer           | Technology                                            | Version                          |
| --------------- | ----------------------------------------------------- | -------------------------------- |
| Framework       | Next.js, App Router, built by vinext                  | 16.3.2, vinext 1.0.0-beta.11     |
| UI              | React / React DOM                                     | 19.2.8                           |
| Styling         | Tailwind CSS                                          | 4.3.3                            |
| Hosting         | Cloudflare Workers, `@cloudflare/vite-plugin`         | wrangler ^4.136.3                |
| Data            | Supabase — Postgres 17, `supabase-js`                 | 2.112.3, CLI 2.115.0             |
| Server SQL      | Drizzle ORM and Kit, on `postgres` 3.4.9              | 1.0.0-rc.4                       |
| Build graph     | pnpm workspace filters (`--filter`, topological `-r`) | pnpm 11.8.0                      |
| Mobile          | Flutter, Dart SDK                                     | ^3.5.0                           |
| Language        | TypeScript, Node                                      | 6.0.3, Node 24 (engines >=22.12) |
| Validation      | Zod, `@t3-oss/env-nextjs`                             | 4.4.3, ^0.13.11                  |
| Tests           | Vitest, jsdom                                         | 4.1.11, ^29.1.1                  |
| Lint and format | ESLint, Prettier                                      | ^9.39.5, 3.9.6                   |

What is unusual, by app: [Next.js](../_shared/guides/stack/nextjs.md?project=platform) and [Tailwind](../_shared/guides/stack/tailwind.md?project=platform) (schedule-builder, platform); [Supabase](../_shared/guides/stack/supabase.md?project=platform) (all three apps); [Database (Drizzle)](../_shared/guides/stack/db.md?project=platform) (schedule-builder, platform); [Flutter](../study-group-finder/guides/typed-models.md) (study-group-finder); [Cloudflare](./infrastructure/cloudflare.md) (deploy, all apps).

Four of the catalog's ranges are held back deliberately: ESLint stays on 9.x (`eslint-plugin-react`, reached through `eslint-config-next`, is not compatible with ESLint 10); TypeScript stays on 6.x (typescript-eslint peer-requires `>=4.8.4 <6.1.0`); Vitest stays on 4.x (5.x is still on the beta dist-tag); jsdom stays on 29.x (30.x raises its Node floor above this repo's declared `engines.node`). Three catalog entries are pinned to an exact version rather than a range: `drizzle-orm` and `drizzle-kit` on `1.0.0-rc.4`, because the `latest` dist-tag still points at 0.45.x, and `zod` on `4.4.3`. `prettier` is pinned to `3.9.6` in the root `package.json` rather than the catalog. `undici` is overridden repo-wide to `^7.28.0` — see [Cloudflare](./infrastructure/cloudflare.md) for the Wasm reason.

</details>

## Reference

An [API reference](./reference/api/supabase.md) page exists for each
`packages/*` published with a public surface — `email` and `supabase` today —
generated from that package's source on every build, so it never drifts from
what the code exports. `@devdogsuga/env` is Backstage-published tooling
rather than a `packages/*` workspace member, so it is documented by hand in
[Env](./guides/env/index.md) instead. The same goes for the two CLIs:
[devtools](./guides/devtools.md) is the contributor CLI, and
`@devdogsuga/backstage` (`pnpm backstage …`) is the officer and production CLI
whose commands are described where you need them — [Env](./guides/env/commands.md),
[Images](./guides/images.md), and [Cloudflare](./infrastructure/cloudflare.md).
