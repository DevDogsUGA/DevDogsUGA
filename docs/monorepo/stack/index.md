---
name: Stack
description: Every technology the monorepo runs on, the version it is pinned to, and where our use of it departs from the defaults.
order: 110
---

# Stack

What the repository runs on, and why each piece is wired the way it is. Read a page here when you are about to change how a technology is configured, or when something behaves differently in this repo than in the documentation you found online. No page here teaches its technology: each gives the version, our conventions, the failures that actually happened, and a link out. Skip the section if you are still getting an app running — [Quickstart](/docs/monorepo/guides/quickstart) is that.

Shared versions live in the `catalog:` block of `pnpm-workspace.yaml`.

| Layer           | Technology                                                                      | Version                          |
| --------------- | ------------------------------------------------------------------------------- | -------------------------------- |
| Framework       | [Next.js](/docs/monorepo/stack/nextjs), App Router                              | 16.3.2                           |
| UI              | React / React DOM                                                               | 19.2.8                           |
| Styling         | [Tailwind CSS](/docs/monorepo/stack/tailwind)                                   | 4.3.3                            |
| Hosting         | [Cloudflare Workers](/docs/monorepo/stack/cloudflare), `@opennextjs/cloudflare` | 1.20.2, wrangler 4.125.0         |
| Data            | [Supabase](/docs/monorepo/stack/supabase) — Postgres 17, `supabase-js`          | 2.112.3, CLI 2.115.0             |
| Server SQL      | [Drizzle ORM and Kit](/docs/monorepo/stack/drizzle), on `postgres` 3.4.9        | 1.0.0-rc.4                       |
| Build graph     | [Turborepo](/docs/monorepo/stack/turborepo) and pnpm workspaces                 | 2.10.11, pnpm 11.8.0             |
| Mobile          | [Flutter](/docs/monorepo/stack/flutter), Dart SDK                               | ^3.5.0                           |
| Language        | TypeScript, Node                                                                | 6.0.3, Node 24 (engines >=22.12) |
| Validation      | Zod, `@t3-oss/env-nextjs`                                                       | 4.4.3, ^0.13.11                  |
| Tests           | Vitest, jsdom                                                                   | 4.1.11, ^29.1.1                  |
| Lint and format | ESLint, Prettier                                                                | ^9.39.5, 3.9.6                   |

## What is unusual here

- **The Workers runtime forbids `WebAssembly.compile()`**, which rewired four dependencies. The failure was a hung request, not an error — [Cloudflare](/docs/monorepo/stack/cloudflare).
- **Cache Components is off on purpose**; `experimental.useCache` keeps `"use cache"` without partial prerendering — [Next.js](/docs/monorepo/stack/nextjs).
- **SQL migrations are the source of truth, not Drizzle**, which only introspects or drafts — [Drizzle](/docs/monorepo/stack/drizzle).
- **One database, one schema per app**, isolated by Row-Level Security — [Supabase](/docs/monorepo/stack/supabase).
- **Turbo's strict env mode deletes** any variable missing from a task's `env` list — [Turborepo](/docs/monorepo/stack/turborepo).
- **A later `@theme` block silently beats an earlier one** — [Tailwind](/docs/monorepo/stack/tailwind).
- **Dart models come from supadart**, which decides PostgREST's default schema — [Flutter](/docs/monorepo/stack/flutter).

<details>
<summary>Which versions are pinned rather than ranged, and why?</summary>

Four of the catalog's ranges are held back deliberately, each with the reason in a comment beside it:

- **ESLint stays on 9.x** — `eslint-plugin-react`, reached through `eslint-config-next`, is not compatible with ESLint 10.
- **TypeScript stays on 6.x** — typescript-eslint peer-requires `>=4.8.4 <6.1.0`, so TypeScript 7 breaks linting in every package.
- **Vitest stays on 4.x** — 5.x is still on the beta dist-tag.
- **jsdom stays on 29.x** — 30.x raises its Node floor above this repo's declared `engines.node`.

Three catalog entries are pinned to an exact version rather than a range: `drizzle-orm` and `drizzle-kit` on `1.0.0-rc.4`, because the `latest` dist-tag still points at 0.45.x and a range would silently downgrade them, and `zod` on `4.4.3`. `prettier` is pinned to `3.9.6` as well, but in the root `package.json` rather than the catalog. One dependency is overridden repo-wide: `undici: ^7.28.0`, for the Wasm reason on the Cloudflare page.

</details>
