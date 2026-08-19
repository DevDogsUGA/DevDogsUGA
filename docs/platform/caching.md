# Caching Strategy

This project uses Next.js [Cache Components](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents) (`cacheComponents: true` in `next.config.ts`). That enables the `"use cache"` directive, `cacheLife()`, `cacheTag()`, and Partial Prerendering (PPR).

The short version: **almost nothing is cached at runtime, because almost nothing needs to be.** Content that used to be fetched and cached is now compiled in at build time, and per-user data is deliberately uncached.

## How `"use cache"` works

Functions and components marked with `"use cache"` have their results cached, keyed on their arguments and source location. Two APIs control behaviour:

- **`cacheLife(profile)`** — the TTL. Named presets (`"seconds"`, `"minutes"`, `"hours"`, `"days"`, `"weeks"`, `"max"`) or a custom object.
- **`cacheTag(tag)`** — associates the entry with a tag for on-demand invalidation via `revalidateTag(tag)`.

See the [Next.js `"use cache"` reference](https://nextjs.org/docs/app/api-reference/directives/use-cache).

> [!IMPORTANT]
> Both Next apps configure the Cloudflare adapter with `defineDevDogsCloudflareConfig()` (`packages/config/opennext/cloudflare.js`), which backs the incremental cache with a per-environment R2 bucket (`NEXT_INC_CACHE_R2_BUCKET` in each `wrangler.jsonc`), so `"use cache"` entries persist across requests. `tagCache` is still `"dummy"`: **`revalidateTag` does nothing** — and nothing in the app calls it. On-demand invalidation would need D1 provisioned first.

## Where `"use cache"` is actually used

| Location                                               | Why                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DocsMarkdown` (`src/components/DocsMarkdown.tsx`)     | **Required.** Something in the markdown plugin chain reads `Date.now()`, which Cache Components forbids during a prerender unless it happens inside a cached function. `cacheLife("max")` is also accurate — the output is a pure function of the markdown source. Every docs page is prerendered, so the entry is baked into the static output. |
| `/community`, `/events`, `/partners`, `/legal/privacy` | Placeholder or static-content pages, cached so they prerender rather than rendering per request.                                                                                                                                                                                                                                                 |
| `HomeSections` (`src/app/(site)/page.tsx`)             | **Required.** Under Cache Components an uncached page contributes _nothing_ to the static shell, so the homepage prerendered as 7.9 KB of nav chrome and re-rendered the whole marketing page on every visit.                                                                                                                                    |
| `Footer` (`src/components/Footer.tsx`)                 | **Required.** Renders in the site layout, above the page's `<Suspense>`, and its copyright line reads the clock — uncached, that read would postpone the layout shell and every route on the site would prerender to nothing. `cacheLife("max")` is required too; see the warning below.                                                         |

There is no cache tag registry any more, and `revalidateTag` is not called anywhere. Docs used to need both; see [Documentation System Architecture](/docs/platform/documentation-system/architecture) for why they went away.

> [!WARNING]
> A route's revalidate window is the **minimum** across every cache entry it renders, so a `"use cache"` component in a _layout_ sets a ceiling for every route beneath it. Mounting `Footer` on the default profile pulled the whole site to 15m, including the docs pages that `DocsMarkdown`'s `cacheLife("max")` had earned 30d — visible in the `next build` route table as `Revalidate` dropping, and in the `s-maxage` the CDN sees. Anything cached above the page needs a `cacheLife` at least as long as the pages under it.

### Caching a page that has one dynamic island

The homepage is the worked example. Everything on it is static marketing copy except `StreakCTA`, which reads the visitor's session. `cookies()` anywhere inside a `"use cache"` scope is a hard build error, so the page splits in two:

```tsx
// Uncached — exists only to construct the dynamic element.
export default function HomePage() {
  return <HomeSections streakCta={<StreakCTA />} />;
}

async function HomeSections({ streakCta }: { streakCta: ReactNode }) {
  "use cache";
  // ... every static section, plus <ProjectsSection streakCta={streakCta} />
}
```

An element created _outside_ the cache scope and passed in as a prop renders outside it too, so its `cookies()` read is legal and it streams into the `<Suspense>` that `ProjectsSection` puts around it. Rendering `<StreakCTA />` inside the cached body instead fails the build. This is the pattern to reach for whenever a mostly-static page has one per-user island.

## What is deliberately _not_ cached

**Per-user data** — profile, permissions, verification status, roles. `getNavUser` (`src/components/TopNav/data.ts`) wraps these in React's `cache()`, **not** `"use cache"`: it reads auth cookies, so it must be a per-request memo rather than a cross-request cache. The distinction matters — caching it across requests would serve one member's navbar to another.

**Docs pages and search.** Docs are compiled into the bundle at build time and prerendered, so there is nothing to cache at runtime. Search reads Postgres per request.

## PPR and the static shell

With PPR, a page's static shell is prerendered and served from the edge while dynamic holes — anything inside `<Suspense>` — stream in. In practice the site chrome (nav, layout, page content) is static and the user-specific navbar cluster streams.

This is why several components sit inside `<Suspense>` boundaries that would otherwise look unnecessary: under Cache Components, `usePathname()` and `useSearchParams()` are dynamic, so a component reading either must render inside a boundary or the whole route falls out of the static shell.

> [!WARNING]
> Reading the current time during render — `new Date()`, `Date.now()` — has the same effect, and it is easy to do by accident. A single `new Date()` in a component tree pulls the entire page out of the static shell, and if the page sits inside a layout-level `<Suspense>`, the whole body becomes a streamed hole. If a route you expected to be static shows as `◐` with a near-empty prerendered shell in `.next/server/app/`, this is the first thing to check.

### Clock reads in client components

Inside a server component the fix is to move the read into a `"use cache"` scope, where the value is resolved at prerender time and baked in. **A client component has no such escape hatch:** its SSR pass cannot sit inside a cache scope, so any clock read there drops the page out of the shell no matter what the server side does.

That makes it a trap, because the read is often not yours. `@date-fns/tz` runs `new Date()` in the `TZDate` constructor unconditionally, so _any_ `format(…, { in: tz(zone) })` in a client component is a clock read. `Intl.DateTimeFormat` with an explicit `timeZone` is the pure equivalent and is what the homepage calendar uses.

The rule that falls out: **resolve "now" once on the server and pass it down as data.** `getCalendarMonth` (`src/app/(site)/calendarMonth.ts`) returns the year, month, today and a `now` timestamp; `MonthCalendar` and `EventsGrid` take those as props and never touch the clock. That also removes a hydration-mismatch class, since SSR and the browser can no longer disagree about what day it is.

> [!NOTE]
> This failure is **silent**. `next build --debug-prerender` reports a hard bail-out such as `cookies()` with a full component stack, but a clock read just postpones the boundary with no message at all. The reliable signal is the size of the route's `.html` in `.next/server/app/` — bisect the tree against it.

See [Navigation System](/docs/platform/navigation) for the full PPR architecture.
