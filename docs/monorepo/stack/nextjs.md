---
name: Next.js
description: Next.js 16 App Router in two apps, with Cache Components deliberately off and the caching rules that survive on Cloudflare Workers.
order: 1
---

# Next.js

Next.js 16.3.2, App Router, in two apps: `platform` (site, console, docs, OAuth server) and `schedule-builder`. Both deploy to Cloudflare Workers through OpenNext, and that runtime shapes every decision below. Read this before adding a `"use cache"` directive, editing `next.config.ts`, or working out why a route you expected to be static renders on every request. It assumes you know the App Router already — [upstream](https://nextjs.org/docs/app) teaches that. `schedule-builder`'s config sets one option; everything here is the platform.

## Cache Components is off, `"use cache"` is on

`next.config.ts` sets `experimental: { authInterrupts: true, useCache: true }` and deliberately **not** `cacheComponents: true`. Partial prerendering is broken on the OpenNext Cloudflare adapter: every `◐` route hung in workerd until the runtime killed the request, while route handlers, middleware and the database kept working. `experimental.useCache` keeps the `"use cache"` and `cacheLife` directives compiling and caching. Only the PPR machinery is off.

<details>
<summary>Why not follow the <code>experimental.useCache</code> deprecation warning?</summary>

Next prints that the flag "is deprecated, please use the top-level `cacheComponents` option instead". Read Next's own `config.js` (search for `E1465`) before acting on it: `cacheComponents` is a plain boolean with no partial mode, and setting it also flips `experimental.ppr = true` internally. There is currently no way to keep `"use cache"` support without PPR except the deprecated flag. The warning is honest about the flag's name, not about there being a working replacement.

</details>

## The rules that bite

**A route's revalidate window is the minimum across every cache entry it renders**, so a `"use cache"` component in a _layout_ sets a ceiling for every route beneath it. Mounting `Footer` on the default 15m profile pulled the whole site to 15m, including docs pages that `DocsMarkdown`'s `cacheLife("max")` had earned 30d. Anything cached above the page needs a `cacheLife` at least as long as the pages under it.

**`DocsMarkdown` carries `"use cache"` because it must.** Something in its markdown plugin chain reads `Date.now()`, which Cache Components forbids during a prerender unless the read happens inside a cached function. `cacheLife("max")` is honest as well as convenient: the rendered output is a pure function of the source string.

**Imports are extensionless.** tsc under bundler resolution tolerates a `.js` suffix on a `.ts` source; Turbopack's production build does not resolve it. One NodeNext-style import broke `next build` invisibly for weeks, because nothing runs a production build between pushes.

**The platform uses `middleware.ts`, not Next 16's `proxy.ts`** — `proxy.ts` runs only on the Node.js runtime, which the OpenNext Cloudflare adapter does not support. Session refresh sticks to edge-safe `@supabase/ssr` APIs.

<details>
<summary>How do you cache a page that has one per-user island?</summary>

`cookies()` anywhere inside a `"use cache"` scope is a hard build error, so the homepage splits in two. An uncached `HomePage` exists only to construct `<StreakCTA />` and pass it as a prop into `HomeSections`, which is the cached half. An element created _outside_ a cache scope renders outside it, so its cookie read is legal and it streams into the `<Suspense>` that `ProjectsSection` puts around it; rendering `<StreakCTA />` inside the cached body fails the build instead. Reach for this pattern whenever a mostly-static page has one per-user island.

Per-user data that must not cross requests at all — profile, permissions, roles — is different. `getNavUser` (`src/components/TopNav/data.ts`) wraps those reads in React's `cache()`, a per-request memo, precisely because `"use cache"` would serve one member's navbar to another.

</details>

<details>
<summary>Why does a client component that formats a date drop the page out of the static shell?</summary>

A client component's SSR pass cannot sit inside a cache scope, so a clock read there has no escape hatch the way a server component does. The read is often not yours: `@date-fns/tz` calls `new Date()` in the `TZDate` constructor unconditionally, so _any_ `format(…, { in: tz(zone) })` in a client component is one. `Intl.DateTimeFormat` with an explicit `timeZone` is the pure equivalent.

The rule that falls out: resolve "now" once on the server, inside a cache scope, and pass it down as data. `getSchedule()` in `src/app/(site)/events/layout.tsx` is the worked example — reading the clock is legal there precisely because it _is_ a `"use cache"` scope, so `now` and `today` are resolved when the entry is built, and `Marquee`, `ScheduleList` and `MonthCalendar` take them as props. That also removes a class of hydration mismatch, since SSR and the browser can no longer disagree about the date.

The failure is silent: a clock read postpones the boundary rather than failing the build, so nothing in the output names it. The signal is the size of the route's prerendered `.html` under `.next/server/app/` — bisect the tree against it.

</details>
