---
name: Local Preview
description: Run the docs from your working copy — the dev server plus a watcher, and one extra step to make search see your edits.
order: 4
section: infrastructure
---

# Local Preview

There is no separate preview tool. Docs are compiled into the platform app, so **the dev server is the preview** — `/docs/...` renders your working copy through the exact pipeline that ships. Read this when you are editing a page and want to see it. Search is the one thing the dev server does not pick up on its own, and the second half of this page is about that. For what to put in the page, see [writing docs](/docs/toolkit/infrastructure/docs-system/writing).

## The loop

The platform's dev server watches `docs/`. Save a page and it re-runs `codegen` for the docs package (and then re-indexes search, see below), and hot-reloads the page. No restart, no second terminal:

```bash
pnpm -F platform dev
```

`cd apps/platform && pnpm dev` does the same. Then open <http://localhost:3000/docs>.

The watcher lives in the platform's `vite.config.ts` and only calls package scripts, so the same step is available by hand when the dev server is not running:

```bash
pnpm -F @devdogsuga/docs codegen
```

## Searching your local docs

Search reads a Postgres index rather than the compiled module. The dev server writes your working copy into it after every docs change, so a page you just wrote is findable in the search dialog (`Ctrl`/`⌘` + `K`). To do it by hand:

```bash
pnpm -F @devdogsuga/docs codegen          # build the docs artifact first
pnpm -F @devdogsuga/docs populate:search  # push it into the search index
```

It is one call to the `platform.replace_docs_index` function, which skips the write when the pages match what is already stored. Like every `with-env`-wrapped command it targets the local stack whenever one is running, and prints which env files it loaded. If the local database is down the dev server prints the failure and keeps serving.

> [!WARNING]
> Without the local stack running, `pnpm dev` and `populate:search` point at the **deployed** database. Pages still render from your working copy, but search results come from whatever that database has indexed. Boot the local stack (`pnpm devtools supabase start`) when you care about search.
>
> The function removes rows for pages that no longer exist, so running `populate:search` against a deployed database from a working copy replaces the live search index with your local state. Check which env files `with-env` printed first.

## What you are checking

Because the dev server uses the same parser and the same renderer as production, a page that looks right locally looks right deployed. Worth confirming before you push:

- The page appears in the sidebar, under the right project **and section**, with the title you expect.
- A mounted `_shared` page appears under every project you listed in `mount`, at the path you expected.
- Code blocks are highlighted — an unregistered language falls back to plain text silently.
- Links between docs pages use site paths (`/docs/toolkit/infrastructure/docs-system/writing`), not file paths. `pnpm -F @devdogsuga/docs exec docs-kit check` fails the build on a broken one rather than warning.
- Every command in a fenced code block is a real one, or the fence is tagged `nocheck` on purpose.
- The table of contents on the right lists the headings you intended, and no heading you buried in a `<details>`.
- `pnpm dev` printed no budget warnings for your page. `pnpm -F @devdogsuga/docs exec docs-kit check` prints the detail behind that count.

Per-branch documentation URLs do not exist. To share docs changes before merge, use a preview deployment of the branch — it serves the whole site, docs included, built from that branch.
