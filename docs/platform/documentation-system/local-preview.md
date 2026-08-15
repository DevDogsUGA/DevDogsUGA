# Local Docs Preview

There is no separate preview tool any more. Docs live in this repo and are compiled into the app, so **the dev server is the preview** — `/docs/...` renders your working copy through the exact pipeline that ships.

## The loop

Run two things:

```bash
pnpm dev        # the app
pnpm dev:docs   # re-parses docs/ on every save
```

`pnpm dev:docs` is `turbo watch build --filter=@devdogsuga/docs`. On save it re-runs the docs package's build, which rewrites the module the routes import; Turbopack picks up the changed module and hot-reloads the page. No restart.

Then open <http://localhost:3000/docs>.

> [!TIP]
> `pnpm dev` alone still works — you just have to restart it to pick up doc edits. Add `pnpm dev:docs` when you are actually writing.

## Searching your local docs

Docs search reads a Postgres index rather than the compiled module, so it needs one extra step to see your working copy. With the local Supabase stack running:

```bash
pnpm --filter platform docs:index
```

That indexes your working copy into the local stack, so a page you just wrote is findable in the search dialog (`Ctrl`/`⌘` + `K`). Re-run it after further edits — the dev server does not re-index for you. Like every `with-env`-wrapped script, it targets the local stack whenever one is running and prints which env files it loaded.

> [!WARNING]
> Without the local stack running, `pnpm dev` and `docs:index` point at the **deployed** database. Pages still render from your working copy, but search results come from what that database has indexed. That mismatch is expected — boot the local stack (`pnpm sb link`) when you care about search.
>
> `docs:index` refuses to write to a non-local database without `--force`. It deletes rows for pages that no longer exist, so running it against production from a working copy would replace the live search index with your local state.

## What you are checking

Because the dev server uses the same parser and the same renderer as production, a page that looks right locally looks right deployed. Worth confirming before you push:

- The page appears in the sidebar, under the right project, with the title you expect (see [Writing Documentation](/docs/platform/documentation-system/writing-docs) for how titles resolve).
- Code blocks are highlighted — an unregistered language silently falls back to plain text.
- Links between docs pages use site paths (`/docs/platform/getting-started`), not file paths.
- The table of contents on the right lists the headings you intended.

## Previewing a branch

Per-branch documentation URLs no longer exist. To share docs changes before merge, use a preview deployment of the branch — it serves the whole site, docs included, built from that branch.
