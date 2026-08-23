---
name: Local Preview
description: Run the docs from your working copy — the dev server plus a watcher, and one extra step to make search see your edits.
order: 30
---

# Local Preview

There is no separate preview tool. Docs are compiled into the platform app, so **the dev server is the preview** — `/docs/...` renders your working copy through the exact pipeline that ships. Read this when you are editing a page and want to see it. Search is the one thing the dev server does not pick up on its own, and the second half of this page is about that. For what to put in the page, see [writing docs](/docs/monorepo/guides/docs-system/writing).

## The loop

Two terminals:

```bash
pnpm dev        # the app
pnpm dev:docs   # re-parses docs/ on every save
```

`pnpm dev:docs` is `turbo watch build --filter=@devdogsuga/docs`. On save it re-runs the docs package's build, which rewrites the module the routes import; Turbopack picks up the changed module and hot-reloads the page. No restart.

Then open <http://localhost:3000/docs>.

> [!TIP]
> `pnpm dev` alone still works — you just have to restart it to pick up doc edits. Add `pnpm dev:docs` when you are actually writing.

## Searching your local docs

Search reads a Postgres index rather than the compiled module, so it takes one extra step to see your working copy. With the local Supabase stack running:

```bash
pnpm --filter platform docs:index
```

That indexes your working copy into the local stack, so a page you just wrote is findable in the search dialog (`Ctrl`/`⌘` + `K`). Re-run it after further edits — the dev server does not re-index for you. Like every `with-env`-wrapped script it targets the local stack whenever one is running, and prints which env files it loaded.

The command itself is `pnpm devtools docs index`. The `pnpm --filter platform docs:index` spelling is an alias that builds the docs artifact first and then runs it, which is why it is the one to reach for — the bare command reads whatever was last built.

> [!WARNING]
> Without the local stack running, `pnpm dev` and `docs index` point at the **deployed** database. Pages still render from your working copy, but search results come from whatever that database has indexed. Boot the local stack (`pnpm sb link`) when you care about search.
>
> The indexer will not write to a non-local database on its own. It deletes the rows for pages that no longer exist, so running it against a deployed database from a working copy would replace the live search index with your local state. At a terminal it asks first; with no TTY — in a script or a CI job, where there is nobody to ask — it refuses and exits non-zero unless given `--force`. That flag is how the deploy scripts say yes.

## What you are checking

Because the dev server uses the same parser and the same renderer as production, a page that looks right locally looks right deployed. Worth confirming before you push:

- The page appears in the sidebar, under the right project, with the title you expect.
- Code blocks are highlighted — an unregistered language falls back to plain text silently.
- Links between docs pages use site paths (`/docs/monorepo/guides/docs-system/writing`), not file paths.
- The table of contents on the right lists the headings you intended, and no heading you buried in a `<details>`.
- `pnpm dev` printed no budget warnings for your page. `pnpm --filter @devdogsuga/docs exec docs-build check` prints the detail behind that count.

Per-branch documentation URLs do not exist. To share docs changes before merge, use a preview deployment of the branch — it serves the whole site, docs included, built from that branch.
