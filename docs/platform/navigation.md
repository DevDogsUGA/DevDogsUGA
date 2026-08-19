# Navigation System

Navigation is a **top nav** (`src/components/TopNav/`) plus a separate **docs
sidebar** (`src/components/DocsSidebar/`). There is no shared manifest module;
the two data sources are:

- **`src/config/nav.ts`** — static consts for everything hand-curated:
  `PUBLIC_LINKS` (the main links), `CONSOLE_ITEMS` (the Console dropdown),
  `PROFILE_ITEMS`, `SEARCH_ONLY_PAGES`, the app-switcher entries, and social
  links. The file's types and comments are the reference.
- **`src/lib/docsTree.ts` + `src/server/docs/queries.ts`** — the docs tree,
  built from the compiled docs data (see
  [Documentation System Architecture](documentation-system/architecture)).

Search (`src/server/search/`) draws on both: `appEntries.ts` builds entries
from the nav config, `docsSearch.ts` from the docs data.

## Permission gating

Each `ConsoleItem` carries a single `permission` field — a key of
`ResolvedPermissions`, or `"credentialsAccess"` for the sandbox-credentials
special case. `visibleConsoleItems` (in `nav.ts`) filters against the signed-in
user's resolved permissions. That one field is the whole visibility model.

## PPR architecture

The site chrome is part of the static shell; the user-specific cluster streams
in. `getNavUser()` (`src/components/TopNav/data.ts`, React `cache()`) is
fetched by an async server component inside `<Suspense>` and handed to
`NavUserProvider` for the client components — profile popover, console
dropdown, verification alert. See [Caching](./caching.md) for the broader
`"use cache"` / PPR setup.
