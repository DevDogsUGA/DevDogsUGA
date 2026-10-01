---
name: Local Preview
description: Run the docs from your working copy — the dev server plus a watcher, and one extra step to make search see your edits.
order: 4
section: infrastructure
---

# Local Preview

There is no separate preview tool. Docs are compiled into the platform app, so **the dev server is the preview** — `/docs/...` renders your working copy through the exact pipeline that ships. Read this when you are editing a page and want to see it. Search is the one thing the dev server does not pick up on its own, and the second half of this page is about that. For what to put in the page, see [writing docs](/docs/toolkit/infrastructure/docs-system/writing).

## The loop

One terminal, and a re-run after each save — there is no file watcher wired into `@devdogsuga/docs`'s build (the underlying `docs-compiler` compiler has no `--watch` mode, and nothing in this repo wraps one around it):

```bash
pnpm dev                                          # the app
pnpm --filter @devdogsuga/docs run codegen        # re-parses docs/ after a save
```

Re-running the docs package's build rewrites the module the routes import; the running dev server picks up the changed module and hot-reloads the page. No restart.

Then open <http://localhost:3000/docs>.

> [!TIP]
> `pnpm dev` alone still works — you just have to re-run the build command above (or restart `pnpm dev`) to pick up doc edits. Re-run it in a second terminal when you are actually writing.

## Searching your local docs

Search reads a Postgres index rather than the compiled module, so it takes one extra step to see your working copy. With the local Supabase stack running:

```bash
pnpm --filter @devdogsuga/docs codegen   # build the docs artifact first
pnpm devtools docs index               # push it into the local search index
```

That indexes your working copy into the local stack, so a page you just wrote is findable in the search dialog (`Ctrl`/`⌘` + `K`). Re-run it after further edits — the dev server does not re-index for you. Like every `with-env`-wrapped command it targets the local stack whenever one is running, and prints which env files it loaded.

> [!WARNING]
> Without the local stack running, `pnpm dev` and `docs index` point at the **deployed** database. Pages still render from your working copy, but search results come from whatever that database has indexed. Boot the local stack (`pnpm devtools db start`) when you care about search.
>
> The indexer will not write to a non-local database on its own. It removes rows for pages that no longer exist, so running it against a deployed database from a working copy would replace the live search index with your local state. At a terminal it asks first; with no TTY — in a script or a CI job, where there is nobody to ask — it refuses and exits non-zero unless `--target remote` is given. That flag is how the deploy scripts say yes.

## What you are checking

Because the dev server uses the same parser and the same renderer as production, a page that looks right locally looks right deployed. Worth confirming before you push:

- The page appears in the sidebar, under the right project **and section**, with the title you expect.
- A mounted `_shared` page appears under every project you listed in `mount`, at the path you expected.
- Code blocks are highlighted — an unregistered language falls back to plain text silently.
- Links between docs pages use site paths (`/docs/toolkit/infrastructure/docs-system/writing`), not file paths. `pnpm --filter @devdogsuga/docs exec docs-compiler check` fails the build on a broken one rather than warning.
- Every command in a fenced code block is a real one, or the fence is tagged `nocheck` on purpose.
- The table of contents on the right lists the headings you intended, and no heading you buried in a `<details>`.
- `pnpm dev` printed no budget warnings for your page. `pnpm --filter @devdogsuga/docs exec docs-compiler check` prints the detail behind that count.

Per-branch documentation URLs do not exist. To share docs changes before merge, use a preview deployment of the branch — it serves the whole site, docs included, built from that branch.
