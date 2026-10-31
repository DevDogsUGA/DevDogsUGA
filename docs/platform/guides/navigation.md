---
name: Navigation
description: The public nav, dashboard registry and docs menus, their access rules, and why the user cluster loads on the client.
order: 4
section: guides
---

# Navigation

The public top nav (`src/components/TopNav/`), dashboard side nav (`src/components/AppSideNav.tsx`) and docs sidebar (`src/components/DocsSidebar/`) use different data sources.

## Navigation sources

`src/config/nav.ts` holds `PUBLIC_LINKS`, `SEARCH_ONLY_PAGES`, social links and shared external URLs. Featured projects and app-switcher entries come from the database through `server/projects/showcase.ts`.

`src/config/dashboard.ts` is the signed-in section registry: labels, URLs, groups, access rules and refusal policies. Account, Projects, Developer and Console sections all live directly under `/dashboard`; Console has no URL segment. The profile popover and mobile sheet offer Dashboard and Sign out beside the member’s name and role. Verification lives on the overview.

**Bundled docs** use compiled data. `src/server/docs/queries.ts` reads the bundled `@devdogsuga/docs` module and `src/lib/docsTree.ts` folds its flat `(path, title, order)` rows into the sidebar tree; the tree itself comes from `getDocsTree(project)`. These bundled reads are in-memory; published project snapshots are loaded separately from R2 by `server/docs/published/` — see [the docs system](../../toolkit/infrastructure/docs-system/index.md).

The navbar has two docs menus, and `src/server/docs/menu.ts` builds both. **Docs** is platform-authored: the rows in `DOCS_MENU` (`src/config/docs.ts`) are Workshops, Shared tooling, Ops and the guides for building on DevDogs, named from the docs' own frontmatter or, for a guide, from the config. **Contribute** is project-authored: the platform first, then every Project whose docs have published, each named and marked by its own project row (its `iconKey` and `colorKey` through the showcase registry), never by a map in the code. The sidebar's project selector uses the same names and marks (`getDocsSwitcher`).

Search draws on both: `src/server/search/appEntries.ts` builds entries from the nav config (plus `src/config/pageSections.ts`, so a query can land on `/dashboard/profile#graduation` rather than `/dashboard/profile`), and `docsSearch.ts` queries Postgres for bundled docs. `publishedDocsSearch.ts` searches published project snapshots.

The dashboard’s Docs toggle opens a reviewed PR for `.github/docs-projects.json` v2, keyed by permanent slug with numeric repo id and confirmed owner. Snapshots still require publishing approval. A repo transfer pauses publishing until an officer confirms the new owner. Docs preview renders the default branch live through the hardened compiler, without code highlighting; owners, contributors and docs reviewers can read it. The same compile powers readiness and `pnpm devtools docs check`.

## Access rules

`server/dashboard/sections.ts` resolves the registry’s named rules against a Caller from `server/auth/access.ts`. The dashboard side nav and search use `visibleSections(caller)`. Signed-out callers see no dashboard search entries. `pageSections.ts` supplies searchable anchors within those entries.

The shared dashboard layout calls `requireDashboard()`; restricted pages call `requireAccess(rules.<name>)` or a domain gate. Record rules protect individual projects, reports and clients. Docs preview uses 404 refusals to avoid leaking project existence. Tests in `server/dashboard/sections.test.ts` check page gates against the registry and its explicit sub-page exceptions.

## Why the user cluster loads on the client

Pages under `(site)` are cached as HTML and shared by every visitor, so nothing in the navbar's server render may depend on who is asking. `TopNav` renders the chrome (logo, links, search, app switcher) plus the loading state of the per-viewer pieces, `TopNavProfile` and `TopNavMobile` in `TopNavUser.tsx`. After hydration, `NavUserProvider` fetches `GET /me` (`app/(api)/me/route.ts`) with TanStack Query and fills them in: the avatar and role, plus verification data and filtered officer sections for consumers of the response.

`/me` runs `getNavUser()` (`TopNav/data.ts`) and returns `private, no-store`. It 404s to a navigation and to a cross-site request, so it isn't a page anyone lands on, and robots.txt disallows it. A visitor with no Supabase session cookie never calls it at all.

It refetches when the tab regains focus after a minute, and whenever the server re-renders the `(site)` layout (a `router.refresh()`, or a server action that revalidates): `NavUserRefresh` receives a fresh object on each such render and invalidates the query. Signing out clears it immediately.

Don't read the session in a `(site)` layout or in `TopNav`. One `cookies()` there makes every page uncacheable, or, worse, caches one member's navbar for everyone.

`NavLinks` sits inside a boundary for a different reason — it is a client component reading `usePathname()` for active-link highlighting, and `NavLinksFallback` renders the same links without it until the pathname resolves.
