---
name: Cloudflare
description: Workers, vinext and wrangler conventions — the Wasm ban that rewired four dependencies, the KV cache adapters, and how a deploy actually ships.
order: 1
section: infrastructure
---

# Cloudflare

Everything here deploys to Cloudflare Workers: two Next.js apps (`platform`, `schedule-builder`) built by **vinext** `1.0.0-beta.11`, plus `sandbox`, a plain Worker with no framework. wrangler is `^4.136.3`. Read this before deploying, adding a binding, or picking a library that speaks HTTP: the restrictions here are unusual and the failures quiet. [Cloudflare's docs](https://developers.cloudflare.com/workers/) teach Workers; this does not.

## Building with vinext

Each Next app's `vite.config.ts` calls `vinext()` and `cloudflare()` (`@cloudflare/vite-plugin`) as Vite plugins. There is no `open-next.config.ts` in this repo any more — vinext compiles the app with Vite directly rather than wrapping a Next build with a separate adapter.

Both apps keep a **custom Worker entry**, `cloudflare/worker.ts`, named by wrangler's `main`, instead of deploying straight from vinext's own `vinext/server/app-router-entry` handler (the path vinext expects when there is nothing else to add). The custom entry exists to compose two things that entry doesn't cover on its own:

- **Sentry**, via `@sentry/cloudflare`'s `withSentry` wrapped around `fetch`/`scheduled` from _outside_ the request's own `AsyncLocalStorage` context — instrumenting from inside collided with vinext's request-scoped context the same way it collided with the old OpenNext adapter.
- **Cron dispatch**, `scheduled(event, env)` from `cloudflare/scheduled.ts`, run alongside the app-router `fetch` handler in the same Worker.

`schedule-builder`'s entry additionally re-exports `ScrapeWorkflow` so wrangler's `workflows[].class_name` binding can find the class from `main`.

## The KV cache, not R2

vinext's own cache adapters replace what the OpenNext adapter used to do with an R2 bucket and an in-memory queue:

- **`cache.data`** — `kvDataAdapter()` (from `@vinext/cloudflare/cache/kv-data-adapter`), backing Next's fetch/`"use cache"` incremental cache with the `VINEXT_KV_CACHE` KV namespace declared in `wrangler.jsonc`. The binding name is fixed by the adapter; every `fetch`/`"use cache"` read misses silently if the name in `wrangler.jsonc` doesn't match.
- **`cache.cdn`** — `cdnAdapter()`, putting CDN-cacheable responses through the deployed Worker's own Cache API. `wrangler.jsonc`'s top-level `cache.enabled` turns this on; it replaces the old `WORKER_SELF_REFERENCE` binding that used to re-invoke the Worker to revalidate.
- **`images.optimizer`** — `imagesOptimizer()`, wired to the `IMAGES` binding.

`schedule-builder` also binds `SCRAPE_WORKFLOW`, a Cloudflare Workflow (`ScrapeWorkflow`), and `HYPERDRIVE`, pooling connections to Supabase's direct database endpoint so request-scoped Drizzle clients don't exhaust Postgres — shared with the platform Worker's own Hyperdrive config per tier, since both point at the same Supabase project.

## The runtime forbids Wasm compilation at request time

workerd rejects `WebAssembly.compile()` outright: _"Wasm code generation disallowed by embedder."_ The symptom is not an error page: the `CompileError` surfaces as an unhandled rejection, the response promise never settles, and the request hangs until the runtime kills it — only once deployed. This is a workerd restriction, independent of vinext or the old OpenNext adapter, and it still rewires the same dependencies:

- **Shiki.** `DocsMarkdown` builds its own `createHighlighterCore` on `createJavaScriptRegexEngine({ forgiving: true })` instead of the stock `@shikijs/rehype` plugin, whose bundled highlighter compiles the Oniguruma engine's Wasm per request. `forgiving` skips the rare grammar rule the JS engine cannot translate rather than throwing — a partially highlighted block beats a hung render.
- **`@discordjs/rest`** takes `makeRequest: fetch`, its own documented escape hatch, and **`open-graph-scraper`** is handed `html` we fetched ourselves. Both otherwise reach for undici, whose first request compiles llhttp's Wasm.
- **undici itself** is overridden repo-wide to `^7.28.0` in `pnpm-workspace.yaml`. Version 6 compiled that Wasm at _module scope_, so importing it at all rejected every page render.

## wrangler conventions

Workers are named `<environment>-<app>` — `staging-platform`, `production-sandbox`. The top level of each `wrangler.jsonc` is the `development-*` worker, carrying no routes and no cron triggers, so an env-less `wrangler deploy` is inert rather than a second worker competing for the apex.

<details>
<summary>Which wrangler keys have to be repeated in every environment?</summary>

`vars`, `ratelimits`, `images`, `send_email`, `hyperdrive`, `kv_namespaces`, `cache` and `version_metadata` are **non-inheritable**: omitting one in an environment does not fall back to the top level, the binding is simply absent, and the failure appears at runtime. `routes` and `triggers` _are_ inherited, which is why the top-level block carries neither. `pnpm exec wrangler deploy --dry-run --env production` prints the resolved binding list and warns about every key left behind.

Staging's `triggers.crons` is empty on purpose rather than merely omitted: staging shares the club's real Discord guild, so a staging cron is not a rehearsal — it would assign real roles to real members twice. Cron routes are exercised by hand instead, through `pnpm devtools cron run --tier staging`.

`send_email` pins `allowed_sender_addresses` to `noreply@mail.devdogsuga.org`; without that list, any code path holding the binding can send as any address on the domain.

</details>

`sandbox` is a plain Worker (`src/index.ts`, no framework), dormant and outside the automated deploy.

## Deploying

`.github/workflows/deploy-app.yaml` is the reusable deploy job both `staging-deploy` and `production-deploy` call. For each of `platform` and `schedule-builder`, in a matrix:

```bash
pnpm -r --filter '<app>^...' run build   # the app's workspace dependencies
pnpm --filter <app> run cf:build:<staging|production>  # with-env vinext build, env validation enforced
```

`sandbox` is not part of this pipeline — there is no team-sandbox integration for it to proxy any more, so deploying it is a manual `pnpm --filter sandbox exec wrangler deploy`.

The `Compose .env.<tier>` step is the only step in the whole workflow that reads the `secrets` and `vars` GitHub Actions contexts — after it runs, the checkout looks like a contributor's laptop with a filled-in env file, and every later step is a command you could run by hand.
