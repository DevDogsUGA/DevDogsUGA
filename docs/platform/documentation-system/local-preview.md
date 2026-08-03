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

Docs search reads a Postgres index rather than the compiled module, so it needs one extra step to see your working copy:

```bash
pnpm --filter @devdogsuga/platform dev:local
```

`dev:local` runs `docs:index:local` against the local Supabase stack before starting the dev server, so a page you just wrote is findable in the search dialog (`Ctrl`/`⌘` + `K`).

Re-run the indexer after further edits:

```bash
pnpm --filter @devdogsuga/platform docs:index:local
```

> [!WARNING]
> Plain `pnpm dev` points at the **deployed** database. Pages render from your working copy, but search results come from what is currently published. That mismatch is expected — use `dev:local` when you care about search.
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
