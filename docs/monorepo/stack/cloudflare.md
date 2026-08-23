---
name: Cloudflare
description: Workers, OpenNext and wrangler conventions — the Wasm ban that rewired four dependencies, and the adapter config that is mandatory rather than an optimisation.
order: 2
---

# Cloudflare

Everything here deploys to Cloudflare Workers: two Next.js apps through `@opennextjs/cloudflare` 1.20.2, plus `sandbox`, a plain Worker. wrangler is 4.125.0. Read this before deploying, adding a binding, or picking a library that speaks HTTP: the restrictions here are unusual and the failures quiet. [Cloudflare's docs](https://developers.cloudflare.com/workers/) teach Workers; this does not.

## The runtime forbids Wasm compilation at request time

workerd rejects `WebAssembly.compile()` outright: _"Wasm code generation disallowed by embedder."_ The symptom is not an error page: the `CompileError` surfaces as an unhandled rejection, the response promise never settles, and the request hangs until the runtime kills it — only once deployed. Four dependencies are rewired around it:

- **Shiki.** `DocsMarkdown` builds its own `createHighlighterCore` on `createJavaScriptRegexEngine({ forgiving: true })` instead of the stock `@shikijs/rehype` plugin, whose bundled highlighter compiles the Oniguruma engine's Wasm per request. `forgiving` skips the rare grammar rule the JS engine cannot translate rather than throwing — a partially highlighted block beats a hung render.
- **`@discordjs/rest`** takes `makeRequest: fetch`, its own documented escape hatch, and **`open-graph-scraper`** is handed `html` we fetched ourselves. Both otherwise reach for undici, whose first request compiles llhttp's Wasm.
- **undici itself** is overridden repo-wide to `^7.28.0`. Version 6 compiled that Wasm at _module scope_, so importing it at all rejected every page render.

## The OpenNext adapter config is mandatory

Both Next apps' `open-next.config.ts` call `defineDevDogsCloudflareConfig()` from `@devdogsuga/config`. A bare `defineCloudflareConfig()` silently throws the whole prerender away — both apps shipped that way for months — because its default incremental cache is `"dummy"`, whose `get()` throws and whose entries are never uploaded. Fully static routes go through that cache too.

- **`incrementalCache`** is R2 behind `withRegionalCache`, one bucket per app per environment, bound as `NEXT_INC_CACHE_R2_BUCKET`.
- **`queue`** is `memoryQueue`. The dummy queue's `send()` throws: the first staging deploy served 500 on every `◐` route once entries aged past their `cacheLife` window.
- **`tagCache`** stays `"dummy"` on purpose, so **`revalidateTag` does nothing** — and nothing calls it.

> [!WARNING]
> Nothing garbage-collects the R2 cache: keys include the build id, so every deploy leaves its predecessor's full copy behind forever. Each bucket wants a 7–30 day lifecycle rule.

## wrangler conventions

Workers are named `<environment>-<app>` — `staging-platform`, `production-sandbox`. The top level of each `wrangler.jsonc` is the `development-*` worker, carrying no routes and no cron triggers, so an env-less `wrangler deploy` is inert rather than a second worker competing for the apex.

<details>
<summary>Which wrangler keys have to be repeated in every environment?</summary>

`vars`, `services`, `images`, `r2_buckets` and `send_email` are **non-inheritable**: omitting one in an environment does not fall back to the top level, the binding is simply absent, and the failure appears at runtime. `routes` and `triggers` _are_ inherited, which is why the top-level block carries neither. `pnpm exec wrangler deploy --dry-run --env production` prints the resolved binding list and warns about every key left behind.

Two bindings have rules of their own. `WORKER_SELF_REFERENCE` must name the same environment's own worker, because that is how the memory queue re-invokes the Worker to revalidate. `send_email` pins `allowed_sender_addresses` to `noreply@mail.devdogsuga.org`; without that list, any code path holding the binding can send as any address on the domain.

Staging's `triggers.crons` is empty on purpose rather than merely omitted: staging shares the production Airtable base and the club's real Discord guild, so a staging cron is not a rehearsal — it would contend for the sync lease and assign real roles to real members twice. Cron routes are exercised by hand with the staging `CRON_SECRET`.

</details>
