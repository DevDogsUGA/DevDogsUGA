---
name: Cloudflare
description: Workers, vinext and wrangler conventions — the Wasm ban that rewired four dependencies, the KV cache adapters, and how a deploy actually ships.
order: 1
section: infrastructure
---

# Cloudflare

Everything deploys to Cloudflare Workers: two Next.js apps built by **vinext** `1.0.0-beta.11`. `schedule-builder` is in this repository; `platform` is in the officers' [Backstage](https://github.com/DevDogsUGA/Backstage) repository, and so is every deploy. wrangler is `^4.136.3`. Read this before adding a binding or picking a library that speaks HTTP: the restrictions here are unusual and the failures quiet. [Cloudflare's docs](https://developers.cloudflare.com/workers/) teach Workers; this does not.

## Building with vinext

Each Next app's `vite.config.ts` calls `vinext()` and `cloudflare()` (`@cloudflare/vite-plugin`) as Vite plugins. There is no `open-next.config.ts` in either repo any more — vinext compiles the app with Vite directly rather than wrapping a Next build with a separate adapter.

Both apps keep a **custom Worker entry**, `cloudflare/worker.ts`, named by wrangler's `main`, instead of deploying straight from vinext's own `vinext/server/app-router-entry` handler (the path vinext expects when there is nothing else to add). The custom entry exists to compose two things that entry doesn't cover on its own:

- **Sentry**, via `@sentry/cloudflare`'s `withSentry` wrapped around `fetch`/`scheduled` from _outside_ the request's own `AsyncLocalStorage` context — instrumenting from inside collided with vinext's request-scoped context the same way it collided with the old OpenNext adapter.
- **Cron dispatch**, `scheduled(event, env)` from `cloudflare/scheduled.ts`, run alongside the app-router `fetch` handler in the same Worker.

`schedule-builder`'s entry additionally re-exports `ScrapeWorkflow` so wrangler's `workflows[].class_name` binding can find the class from `main`.

## The KV cache, not R2

vinext's own cache adapters replace what the OpenNext adapter used to do with an R2 bucket and an in-memory queue:

- **`cache.data`** — `kvDataAdapter()` (from `@vinext/cloudflare/cache/kv-data-adapter`), backing Next's fetch/`"use cache"` incremental cache with the `VINEXT_KV_CACHE` KV namespace declared in `wrangler.jsonc`. The binding name is fixed by the adapter; every `fetch`/`"use cache"` read misses silently if the name in `wrangler.jsonc` doesn't match.
- **`cache.cdn`** — `cdnAdapter()`, putting CDN-cacheable responses through the deployed Worker's own Cache API. `wrangler.jsonc`'s top-level `cache.enabled` turns this on; it replaces the old `WORKER_SELF_REFERENCE` binding that used to re-invoke the Worker to revalidate.
- **`images.optimizer`** — `imagesOptimizer()`, wired to the `IMAGES` binding.

### When the platform's page HTML is cached

A `(site)` page is served from the Workers Cache, shared by every visitor, only when all of these hold. Break one and the page quietly renders on every request instead.

- **It declares a policy.** A page with no `revalidate` export is never written to the cache. Public pages export one: `false` for pages built from the repo (docs, changelog, legal), a number of seconds for ones that read the database (the homepage and competitions every minute, `/events` every five).
- **Nothing in its render reads the request.** `cookies()`, `headers()`, `connection()` or `searchParams` anywhere in the tree, root layout included, makes it dynamic. That's why the navbar's user comes from `GET /me` on the client ([navigation](../../platform/guides/navigation.md)).
- **Middleware leaves the request alone.** vinext skips the shared cache whenever middleware forwards request headers (`NextResponse.next({ request })`). The platform's middleware forwards them only on `/tools` and when a session's tokens rotate.
- **No CSP nonce at render.** vinext won't cache HTML rendered under a request nonce. Pages render with none, and the Worker entry (`apps/platform/cloudflare/nonce.ts` in Backstage) stamps a fresh one onto every `<script>` of every HTML response with `HTMLRewriter`, cache hits included, and sends the matching policy. That trusts every script in the HTML, so the docs compiler fails the build on a `<script>`, an `on*` attribute or a `javascript:` URL in a page.

`wrangler dev` doesn't emulate the Workers Cache, so a local preview renders every request and never shows `X-Vinext-Cache`; check that header on staging. Entries are keyed by the deployment's version, so a deploy starts from an empty cache. `@vinext/cloudflare` is patched (see `pnpm-workspace.yaml`) because its cached stage followed redirects inside the Worker, which turned every redirecting page into a 500 once pages started using it.

`schedule-builder` also binds `SCRAPE_WORKFLOW`, a Cloudflare Workflow (`ScrapeWorkflow`), and `HYPERDRIVE`, pooling connections to Supabase's direct database endpoint so request-scoped Drizzle clients don't exhaust Postgres — shared with the platform Worker's own Hyperdrive config per tier, since both point at the same Supabase project.

## The runtime forbids Wasm compilation at request time

workerd rejects `WebAssembly.compile()` outright: _"Wasm code generation disallowed by embedder."_ The symptom is not an error page: the `CompileError` surfaces as an unhandled rejection, the response promise never settles, and the request hangs until the runtime kills it — only once deployed. This is a workerd restriction, independent of vinext or the old OpenNext adapter, and it still rewires the same dependencies:

- **Shiki.** `DocsMarkdown` builds its own `createHighlighterCore` on `createJavaScriptRegexEngine({ forgiving: true })` instead of the stock `@shikijs/rehype` plugin, whose bundled highlighter compiles the Oniguruma engine's Wasm per request. `forgiving` skips the rare grammar rule the JS engine cannot translate rather than throwing — a partially highlighted block beats a hung render.
- **`@discordjs/rest`** takes `makeRequest: fetch`, its own documented escape hatch, and **`open-graph-scraper`** is handed `html` we fetched ourselves. Both otherwise reach for undici, whose first request compiles llhttp's Wasm.
- **undici itself** is overridden repo-wide to `^7.28.0` in `pnpm-workspace.yaml`. Version 6 compiled that Wasm at _module scope_, so importing it at all rejected every page render.

## wrangler conventions

Workers are named `<environment>-<app>` — `staging-platform`, `production-schedule-builder`. The top level of each `wrangler.jsonc` is the `development-*` worker, carrying no routes and no cron triggers, so an env-less `wrangler deploy` is inert rather than a second worker competing for the apex.

<details>
<summary>Which wrangler keys have to be repeated in every environment?</summary>

`vars`, `ratelimits`, `images`, `send_email`, `hyperdrive`, `kv_namespaces`, `cache` and `version_metadata` are **non-inheritable**: omitting one in an environment does not fall back to the top level, the binding is simply absent, and the failure appears at runtime. `routes` and `triggers` _are_ inherited, which is why the top-level block carries neither. `pnpm exec wrangler deploy --dry-run --env production` prints the resolved binding list and warns about every key left behind.

Staging's `triggers.crons` is empty on purpose rather than merely omitted: staging shares the club's real Discord guild, so a staging cron is not a rehearsal — it would assign real roles to real members twice. Cron routes are exercised by hand instead, through `pnpm devtools jobs run --tier staging`.

`send_email` pins `allowed_sender_addresses` to `noreply@mail.devdogsuga.org`; without that list, any code path holding the binding can send as any address on the domain.

</details>

## Deploying

Nothing in this repository deploys. A push to `main` here, once CI is green, opens or updates a deploy pull request in [Backstage](https://github.com/DevDogsUGA/Backstage) that moves its `devdogsuga.lock` to the new commit; merging it deploys staging, and production waits behind the `production` environment for a `devops` reviewer. Backstage's `.github/workflows/deploy.yaml` runs, for each of `platform` and `schedule-builder`:

```bash
DEPLOY_ENV=<staging|production> pnpm -F <app> build  # with-env vinext build, env validation enforced
```

then `backstage deploy` subcommands: `write-env` composes the env file, `preflight` classifies the project as paused (skip) or broken (fail), `plan` and `migrate` dry-run and apply the migrations, `<app>` checks `CLOUDFLARE_API_TOKEN`, writes the Worker's secrets file and runs `wrangler deploy`, and `smoke` and `reconcile` check the result and reconcile the platform's config. `backstage deploy --help` lists them. The platform's docs search index is refreshed after its Worker deploys with `pnpm -F @devdogsuga/docs populate:search`. `schedule-builder` is built from this repository's commit pinned in the lock, so Backstage's deploy checks it out beside its own code.

The `Compose .env.<tier>` step is the only step in the workflow that reads the `secrets` and `vars` GitHub Actions contexts — after it runs, the checkout looks like a contributor's laptop with a filled-in env file, and every later step is a command you could run by hand. The workflow, its environments and its secrets are documented in Backstage's README.
