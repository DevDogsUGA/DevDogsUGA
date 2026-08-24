---
name: Navigation
description: The top nav and the docs sidebar, the two data sources behind them, how console items are gated by permission, and why the user cluster streams.
order: 4
---

# Navigation

Two separate surfaces, not one system: a **top nav** (`src/components/TopNav/`) that every page in the `(site)` layout carries, and a **docs sidebar** (`src/components/DocsSidebar/`) mounted only by `app/(site)/docs/[project]/layout.tsx`. There is no shared manifest module. Read this before adding a link, adding a console page, or working out where a navbar entry comes from.

## The two data sources

**`src/config/nav.ts`** holds everything hand-curated, as plain exported consts: `PUBLIC_LINKS` (the navbar's own links), `CONSOLE_ITEMS` (the Console dropdown), `PROFILE_ITEMS` (the profile popover), `SEARCH_ONLY_PAGES` (indexed but not shown), and the app-switcher and social entries. The file's types and comments are the reference — `INVOLVEMENT_NETWORK_URL` and its `/events` and `/roster` variants live there too, so every page that sends a member to the Involvement Network imports the URL rather than retyping it.

**The compiled docs data** is the other one. `src/server/docs/queries.ts` reads the bundled `@devdogsuga/docs` module and `src/lib/docsTree.ts` folds its flat `(path, title, order)` rows into the sidebar tree. Both the navbar's Docs menu and the sidebar's project selector come from `getDocsProjects()`; the tree itself comes from `getDocsTree(project)`. Every read is in-memory — see [the docs system](/docs/monorepo/guides/docs-system).

Search draws on both: `src/server/search/appEntries.ts` builds entries from the nav config (plus `src/config/pageSections.ts`, so a query can land on `/account#graduation` rather than `/account`), and `docsSearch.ts` queries Postgres for the docs.

## Permission gating

Each `ConsoleItem` carries one `permission` field — a key of `ResolvedPermissions`, or the string `"credentialsAccess"` for the credentials page, whose visibility goes beyond the flat flags and is resolved by `canSeeCredentialsPage`. `visibleConsoleItems(permissions, credentialsAccess)` in `nav.ts` filters the list, and it runs on the server: the client only ever receives the items it may see. That one field is the whole visibility model, and search inherits it, because sub-entries are only generated for a page the caller could already open.

The items are not the enforcement. Each console page enforces its own permission server-side; `CONSOLE_ITEMS` decides what is offered, so the two are kept in step by hand.

## Why the user cluster streams

`TopNav` renders the chrome — logo, links, search, app switcher — and wraps each per-request piece in its own `<Suspense>`: `TopNavConsole`, `TopNavProfile`, and `TopNavMobile`, all in `TopNavUser.tsx`. Each awaits `getNavUser()` (`TopNav/data.ts`), wrapped in React's `cache()` so the three share one lookup. It is deliberately **not** `"use cache"`: it reads auth cookies, so it must be a per-request memo. A cross-request cache here would serve one member's navbar to another.

`NavLinks` sits inside a boundary for a different reason — it is a client component reading `usePathname()` for active-link highlighting, and `NavLinksFallback` renders the same links without it until the pathname resolves.

Partial prerendering is currently switched off, so this shape buys less than it was written for; see [Next.js](/docs/monorepo/stack/nextjs) for what `cacheComponents` does and why it is off. The boundaries stay because the data behind them is genuinely per-request either way.
