---
name: Next.js
description: Next.js 16 App Router, built for Cloudflare Workers by vinext, with Cache Components deliberately off.
order: 1
section: guides
mount: [schedule-builder, platform]
---

# Next.js

Next.js 16.3.2, App Router, in two apps: `platform` (site, console, docs, OAuth server) and `schedule-builder`. Both build with **vinext** (`1.0.0-beta.11`), which compiles the app with Vite and deploys it to Cloudflare Workers — see [Cloudflare](../../../toolkit/infrastructure/cloudflare.md) for the build and deploy side of that. Read this before adding a `"use cache"` directive, editing `next.config.ts`, or working out why a route you expected to be static renders on every request. It assumes you know the App Router already — [upstream](https://nextjs.org/docs/app) teaches that.

## Cache Components is off, `"use cache"` is on

`next.config.ts` sets `experimental: { authInterrupts: true, useCache: true }` and deliberately **not** `cacheComponents: true`. `experimental.useCache` keeps the `"use cache"` and `cacheLife` directives compiling and caching without turning on partial prerendering.

That flag was set for a specific reason: Cache Components' partial prerendering broke under the old OpenNext Cloudflare adapter — every `◐` route hung in workerd until the runtime killed the request. vinext replaces that adapter, and the repo has not gone back to re-test whether the same failure still holds under it. The flag is still off; nobody has yet turned it on to find out.

<details>
<summary>Why not follow the <code>experimental.useCache</code> deprecation warning?</summary>

Next prints that the flag "is deprecated, please use the top-level `cacheComponents` option instead". Read Next's own `config.js` (search for `E1465`) before acting on it: `cacheComponents` is a plain boolean with no partial mode, and setting it also flips `experimental.ppr = true` internally. There is currently no way to keep `"use cache"` support without PPR except the deprecated flag. The warning is honest about the flag's name, not about there being a working replacement.

</details>

## The rules that bite

**A route's revalidate window is the minimum across every cache entry it renders**, so a `"use cache"` component in a _layout_ sets a ceiling for every route beneath it. Anything cached above the page needs a `cacheLife` at least as long as the pages under it.

**`DocsMarkdown` carries `"use cache"` because it must.** Something in its markdown plugin chain reads `Date.now()`, which Cache Components forbids during a prerender unless the read happens inside a cached function. `cacheLife("max")` is honest as well as convenient: the rendered output is a pure function of the source string.

**Imports are extensionless.** tsc under bundler resolution tolerates a `.js` suffix on a `.ts` source; Vite's production build does not resolve it.

**Both apps still use `middleware.ts`, not Next 16's `proxy.ts`.** The reason on record is that `proxy.ts` runs only on the Node.js runtime, which the old OpenNext Cloudflare adapter did not support — session refresh sticks to edge-safe `@supabase/ssr` APIs instead. Nobody has re-verified that constraint under vinext/workerd; treat it as unconfirmed rather than settled, but `middleware.ts` is what both apps ship today either way.

<details>
<summary>How do you cache a page that has one per-user island?</summary>

`cookies()` anywhere inside a `"use cache"` scope is a hard build error, so a page with one per-user island splits in two: an uncached component constructs the per-user piece and passes it as a prop into the cached component that renders everything else. An element created _outside_ a cache scope renders outside it, so its cookie read is legal and it streams into a `<Suspense>` boundary; rendering it inside the cached body fails the build instead.

Per-user data that must not cross requests at all — profile, permissions, roles — is different: wrap those reads in React's `cache()`, a per-request memo, precisely because `"use cache"` would serve one member's data to another.

</details>

<details>
<summary>Why does a client component that formats a date drop the page out of the static shell?</summary>

A client component's SSR pass cannot sit inside a cache scope, so a clock read there has no escape hatch the way a server component does. The read is often not yours: `@date-fns/tz` calls `new Date()` in the `TZDate` constructor unconditionally, so _any_ `format(…, { in: tz(zone) })` in a client component is one. `Intl.DateTimeFormat` with an explicit `timeZone` is the pure equivalent.

The rule that falls out: resolve "now" once on the server, inside a cache scope, and pass it down as data. That also removes a class of hydration mismatch, since SSR and the browser can no longer disagree about the date.

The failure is silent: a clock read postpones the boundary rather than failing the build, so nothing in the output names it.

</details>
