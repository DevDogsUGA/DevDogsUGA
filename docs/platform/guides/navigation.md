---
name: Navigation
description: The top nav and the docs sidebar, the two data sources behind them, how console items are gated by permission, and why the user cluster loads on the client.
order: 4
section: guides
---

# Navigation

Two separate surfaces, not one system: a **top nav** (`src/components/TopNav/`) that every page in the `(site)` layout carries, and a **docs sidebar** (`src/components/DocsSidebar/`) mounted only by `app/(site)/docs/[project]/layout.tsx`. There is no shared manifest module. Read this before adding a link, adding a console page, or working out where a navbar entry comes from.

## The two data sources

**`src/config/nav.ts`** holds everything hand-curated, as plain exported consts: `PUBLIC_LINKS` (the navbar's own links), `CONSOLE_ITEMS` (the Console dropdown), `PROFILE_ITEMS` (the profile popover), `SEARCH_ONLY_PAGES` (indexed but not shown), and the app-switcher and social entries. The file's types and comments are the reference — `INVOLVEMENT_NETWORK_URL` and its `/events` and `/roster` variants live there too, so every page that sends a member to the Involvement Network imports the URL rather than retyping it.

**The compiled docs data** is the other one. `src/server/docs/queries.ts` reads the bundled `@devdogsuga/docs` module and `src/lib/docsTree.ts` folds its flat `(path, title, order)` rows into the sidebar tree. Both the navbar's Docs menu and the sidebar's project selector come from `getDocsProjects()`; the tree itself comes from `getDocsTree(project)`. Every read is in-memory — see [the docs system](/docs/toolkit/infrastructure/docs-system).

Search draws on both: `src/server/search/appEntries.ts` builds entries from the nav config (plus `src/config/pageSections.ts`, so a query can land on `/account#graduation` rather than `/account`), and `docsSearch.ts` queries Postgres for the docs.

## Permission gating

Each `ConsoleItem` carries one `permission` field — a key of `ResolvedPermissions`. `visibleConsoleItems(permissions)` in `nav.ts` filters the list, and it runs on the server, inside `GET /me`: the client only ever receives the items it may see. That one field is the whole visibility model, and search inherits it, because sub-entries are only generated for a page the caller could already open.

The items are not the enforcement. Each console page enforces its own permission server-side; `CONSOLE_ITEMS` decides what is offered, so the two are kept in step by hand.

## Why the user cluster loads on the client

Pages under `(site)` are cached as HTML and shared by every visitor, so nothing in the navbar's server render may depend on who is asking. `TopNav` renders the chrome (logo, links, search, app switcher) plus the loading state of the per-viewer pieces, `TopNavProfile` and `TopNavMobile` in `TopNavUser.tsx`. After hydration, `NavUserProvider` fetches `GET /me` (`app/(api)/me/route.ts`) with TanStack Query and fills them in: the avatar, the role, the filtered console items, and the verification checklist data that `/account` also reads.

`/me` runs `getNavUser()` (`TopNav/data.ts`) and returns `private, no-store`. It 404s to a navigation and to a cross-site request, so it isn't a page anyone lands on, and robots.txt disallows it. A visitor with no Supabase session cookie never calls it at all.

It refetches when the tab regains focus after a minute, and whenever the server re-renders the `(site)` layout (a `router.refresh()`, or a server action that revalidates): `NavUserRefresh` receives a fresh object on each such render and invalidates the query. Signing out clears it immediately.

Don't read the session in a `(site)` layout or in `TopNav`. One `cookies()` there makes every page uncacheable, or, worse, caches one member's navbar for everyone.

`NavLinks` sits inside a boundary for a different reason — it is a client component reading `usePathname()` for active-link highlighting, and `NavLinksFallback` renders the same links without it until the pathname resolves.
