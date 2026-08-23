---
name: Docs System
description: How a markdown file under docs/ becomes a rendered page and a search result on the platform site.
order: 20
---

# The Docs System

Everything under `docs/` is compiled into the platform site at build time, so a docs change ships with a deploy like any other change. Read this if you want to know where your markdown ends up and why nothing has to be invalidated. If you only want to write a page, go straight to [Writing docs](/docs/monorepo/guides/docs-system/writing); for the local loop, [Local preview](/docs/monorepo/guides/docs-system/preview). Nothing here is something you need to know to add a page.

## From markdown to page

`docs/` is a workspace package — `@devdogsuga/docs` — holding markdown and a `package.json` and nothing else. Its entire build script is `docs-build`, the CLI from `@devdogsuga/docs-build`, which treats its working directory as the content root, walks it for `*.md`, parses each file, and emits `dist/index.js` plus a hand-written `dist/index.d.ts`. Emitting the declarations by hand rather than running `tsc` is what keeps the content package free of a TypeScript toolchain.

Being a package is what makes the rest work. The platform depends on it, so the `dependsOn: ["^build"]` already on `build`, `dev`, `typecheck`, `lint` and `test` in `turbo.json` produces the artifact before any of them run. There is no bespoke file watcher either: `turbo watch` sees markdown edits at package granularity because the markdown _is_ a package.

The docs routes import that module and render from memory:

| Route                       | Renders                               |
| --------------------------- | ------------------------------------- |
| `/docs`                     | the project cards                     |
| `/docs/[project]`           | redirects to the project's first page |
| `/docs/[project]/[...slug]` | the page itself                       |

`generateStaticParams` enumerates every page, so all of them are prerendered. A path it did not enumerate renders on demand and 404s — safe on Workers, because the lookup reads a bundled constant rather than the filesystem. There is no GitHub API call, no webhook, and no cache invalidation.

<details>
<summary>What <code>parseDocFile</code> extracts from each file</summary>

`packages/docs-build/src/parse.ts` is a `unified` + `remark-parse` pass producing, per file: `title`, `description`, `order`, the raw `frontmatter`, `headings` (id, title, depth), `content` (markdown with front matter stripped), and `plainText` (the document flattened, for search).

Heading ids are slugged with `github-slugger` — the same slugger `rehype-slug` uses at render time, so an anchor written against a heading resolves to the id the page actually ships.

`plainText` is not `mdast-util-to-string` over the whole tree. That concatenates every descendant with no delimiter, so a heading's last word fuses with the next paragraph's first: "Caching StrategyThis project…". Postgres tokenises the pair as one word, which makes the text on both sides of every block boundary unsearchable and garbles snippets. The parser recurses until a node's children are inline, then flattens, joining blocks with a blank line.

</details>

## Search

Search is the one part that still uses Postgres, because it is the one part whose cost scales with how much documentation exists. `platform."docsPages"` holds `path`, `title`, `description` and `plainText` alongside a generated `tsvector` weighting title `A`, description `B` and body `C` — so page bodies are searchable, and a title match outranks a body match. `searchDocs` queries it with `websearch_to_tsquery`, ranks with `ts_rank`, and builds snippets with `ts_headline`.

The build does not write that index. `pnpm devtools docs index` pushes the compiled artifact into the database, and both deploy scripts run it ahead of every release — see [Local preview](/docs/monorepo/guides/docs-system/preview) for pointing it at your own stack.

<details>
<summary>Why Postgres rather than an in-memory JS index?</summary>

Two reasons, both about where the cost lands.

A JS index scales with total body bytes and would be rebuilt on **every Worker isolate cold start**. A GIN-indexed `tsvector` is indifferent to corpus size, and the query runs on a machine that is already awake.

`ts_headline` is also stem-aware. Search `caching` and it highlights `cache` — the word that actually matched. A substring highlighter would find nothing to mark and hand back an unhighlighted snippet.

That output is wrapped in control-character sentinels rather than `<mark>` directly, then HTML-escaped and substituted, so document content can never inject markup into the search dialog.

</details>

## Why it's like this

<details>
<summary>Why can't the compiler live in the platform app?</summary>

Platform is its only consumer, which makes it tempting. But `docs` would have to depend on `platform` to run the compiler, and `platform` already depends on `docs` for the parsed output — a cycle that turbo's `^build` ordering cannot resolve. A separate package is what breaks it.

</details>

<details>
<summary>What this replaced</summary>

Docs used to be ingested from the GitHub API into three tables — `docsRepos`, `docsBranches`, `docsPages` — by a push-webhook sync, then served through `"use cache"` and `revalidateTag`. That design existed because docs lived in repositories deploying on a different cadence than the site, which stopped being true once everything moved into this monorepo.

The invalidation half never worked anyway: the Cloudflare adapter leaves `tagCache` at `"dummy"`, so every `revalidateTag` call was a no-op. Nothing in the repo calls it today either.

Per-branch documentation previews went away with the sync. A branch preview is now a preview deployment of the whole site from that branch, docs included.

</details>
