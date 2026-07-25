# Navigation System

The website's navigation uses a unified manifest for both the sidebar and the search system, with [Partial Prerendering (PPR)](https://nextjs.org/docs/app/building-your-application/rendering/partial-prerendering) to serve the static navigation shell instantly while streaming in user-specific data.

## Manifest

All navigable pages are described in a single manifest (`src/server/manifest/`). The manifest serves three consumers:

1. **Sidebar navigation** — which items to show, organized by group and category
2. **Search index** — page-level and heading-level entries with breadcrumbs
3. **Docs page TOC** — pre-computed heading data (id, title, depth)

### App pages

Static app pages are defined in `src/server/manifest/app-registry.ts`. Each entry specifies its title, URL, icon, group, and visibility rule.

### Doc pages

Dynamic documentation pages are cached per-file using `"use cache"` functions in `src/server/manifest/docs-cache.ts`. See [Documentation System Architecture](documentation-system/architecture) for details.

## Visibility rules (`RestrictVisibility`)

Every manifest entry has a `restrictVisibility` field that controls who can see it:

- `false` — visible to everyone (no restriction)
- `[{}]` — visible only to signed-in users (no specific permissions required)
- `[{ canModerate: true }]` — visible only if the user has the `canModerate` permission
- `[{ canModerate: true }, { canViewAuditLog: true }]` — visible if the user has `canModerate` OR `canViewAuditLog`

The matching rule: the user must have **all** `true` permissions in **at least one** array item. Missing keys are treated as not required.

The evaluation function is in `src/server/manifest/visibility.ts`.

## PPR architecture

The navigation uses PPR to split rendering into a static shell and dynamic holes:

### Static shell (instant from CDN)

- Sidebar chrome: logo, resize handle, collapse toggle
- Static nav groups: Community, Events, Partners, Documentation category
- Search trigger button
- Mobile FAB

### Dynamic holes (streamed via Suspense)

- **User profile section** — avatar, role badge, sign-out
- **Permission-gated nav items** — console pages filtered by permissions
- **Verification alert** — shown if the user hasn't completed verification

User data is fetched by `NavDynamicData` (`src/components/Navigation/NavDynamicData.tsx`), an async server component wrapped in `<Suspense>` in the root layout. It passes data to a client-side context (`NavDataProvider`) that the sidebar components read from.

### Sidebar state

Sidebar collapse and width state is stored in cookies (`appSidebarCollapsed`, `appSidebarWidth`). Since PPR's static shell can't read cookies, a tiny inline `<script>` in `<head>` reads them and sets CSS custom properties on `<html>` before React renders — preventing layout shift.

See `src/components/Navigation/SidebarStateScript.tsx`.

## Shared tree renderer

The sidebar documentation section and the local preview sidebar both use `DocTreeRenderer` (`src/components/Navigation/Sidebar/DocTreeRenderer.tsx`), a client component that renders `DocTreeNode[]` using Fumadocs sidebar primitives. The two sidebars differ only in their data source:

- **Remote**: server actions calling cached manifest functions
- **Local preview**: `fetchTree()` from the local preview server

**References:**

- [Next.js PPR](https://nextjs.org/docs/app/building-your-application/rendering/partial-prerendering)
- [Next.js Cache Components](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents)
- [React Suspense](https://react.dev/reference/react/Suspense)
