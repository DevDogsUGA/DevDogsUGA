---
name: Docs System
description: How a markdown file under docs/ becomes a rendered page and a search result on the platform site.
order: 3
section: infrastructure
---

# The Docs System

Everything under `docs/` is compiled into the platform site at build time, so a docs change ships with a deploy like any other change. Read this if you want to know where your markdown ends up and why nothing has to be invalidated. If you only want to write a page, go straight to [Writing docs](/docs/toolkit/infrastructure/docs-system/writing); for the local loop, [Local preview](/docs/toolkit/infrastructure/docs-system/preview). Nothing here is something you need to know to add a page.

## From markdown to page

`docs/` is a workspace package — `@devdogsuga/docs` — holding markdown and a `package.json` and nothing else. Its `codegen` script is `docs-compiler build`, from `@devdogsuga/docs-compiler`, a package published from the sibling Backstage repository. It skips the whole build when none of its inputs changed since the last one. Otherwise `docs-compiler` treats its working directory as the content root, walks it for `*.md`, parses each file, and emits `dist/index.js` plus a hand-written `dist/index.d.ts`. Emitting the declarations by hand rather than running `tsc` is what keeps the content package free of a TypeScript toolchain.

Rendering happens **in the compiler, at build time** — Shiki for code, KaTeX for math, GitHub alerts, the whole markdown-to-HTML pass — not in the platform app at request time. Each page in the emitted module already carries its rendered `html` string alongside its headings and search text; `DocPageContent` drops that string in with `dangerouslySetInnerHTML`, safe only because nothing a visitor wrote ever reaches it. The platform holds no markdown renderer of its own.

Being a package is what makes the rest work. The platform depends on it, so pnpm's dependency-ordered recursive runs produce the artifact before `build`, `dev`, `typecheck`, `lint` or `test` runs against anything that needs it. There is no bespoke file watcher; see [Local preview](/docs/toolkit/infrastructure/docs-system/preview) for the manual re-run this takes instead.

The docs routes import that module and render from memory:

| Route                       | Renders                               |
| --------------------------- | ------------------------------------- |
| `/docs`                     | the project cards                     |
| `/docs/[project]`           | redirects to the project's first page |
| `/docs/[project]/[...slug]` | the page itself                       |

`generateStaticParams` enumerates every page, so all of them are prerendered. A path it did not enumerate renders on demand and 404s — safe on Workers, because the lookup reads a bundled constant rather than the filesystem. There is no GitHub API call, no webhook, and no cache invalidation.

## Projects, sections and shared pages

`docs/` is grouped by project: each immediate subfolder of `docs/` (except `_shared`, below) is one project, and its name is the first segment of the URL. The projects today are `schedule-builder`, `study-group-finder`, `platform`, and `toolkit`.

Every page other than a project's own `index.md` carries a `section` in its front matter: `getting-started`, `guides`, `infrastructure`, or `reference`. The sidebar renders a project's pages grouped by section, in that fixed order, with the project's `index.md` first as "Overview". A page with no `section` defaults to `reference` if it sits under a `reference/` folder, otherwise `guides`.

`docs/_shared/` is not a project — it takes no card on `/docs` and no entry in the project switcher. A page there declares `mount: [<project slugs>]` in its front matter, and the compiler emits a copy of that page into each listed project, at the same relative path (`docs/_shared/guides/stack/nextjs.md` mounted into `platform` becomes `/docs/platform/guides/stack/nextjs`). Every emitted copy carries `mountedFrom: "_shared/<path>"` in its parsed data, which is what an edit link uses to point back at the one file that's actually source. A mounted page landing on a path a project already has for real is a build error, not a silent overwrite — rename one side.

## Reference generation

`docs-compiler gen` walks TypeScript sources and writes `docs/<project>/reference/`. Today that's `toolkit` only: the shared packages published from Backstage. App-level `reference/` directories (one per Next app, one Dart extractor for `study-group-finder`) have been removed — an app's own code is not a published package with a stable public surface the way `packages/*` is, so a generated enumeration of it aged badly relative to the guide pages that already cover it by hand.

## Checks

`docs-compiler check` runs two kinds of check over the hand-written pages, and they disagree on purpose about whether to fail the build.

Prose checks — page length, collapsible defects, missing descriptions — **warn and never fail**; see [Writing docs](/docs/toolkit/infrastructure/docs-system/writing#why-its-like-this) for why. The bare `docs-compiler` run prints the count on its summary line; `docs-compiler check` prints the detail.

Link and command checks are the opposite: they **fail the build**. Every link between docs pages is resolved against the pages that actually exist, and every `pnpm`/`devtools` command inside a fenced code block is checked against the real command tree, so a renamed page, a moved mount, or a renamed CLI subcommand breaks the build the same day it happens rather than going stale until someone notices. A code block that isn't a command to run — example output, a hypothetical invocation, a snippet from another tool — opts out with a `nocheck` fence-info-string suffix:

````md
```bash nocheck
some-tool-this-repo-does-not-have do-a-thing
```
````

<details>
<summary>What <code>parseDocFile</code> extracts from each file</summary>

Backstage's `packages/docs-compiler/src/parse.ts` is a `unified` + `remark-parse` pass producing, per file: `title`, `description`, `order`, `section`, `mount`, the raw `frontmatter`, `headings` (id, title, depth), `content` (markdown with front matter stripped), and `plainText` (the document flattened, for search).

Heading ids are slugged with `github-slugger` — the same slugger `rehype-slug` uses at render time, so an anchor written against a heading resolves to the id the page actually ships. There is no way to set an explicit id independent of the heading text; if you need a stable anchor, write the heading so it slugs to the id you want and say so in a comment, since editing the heading's wording later silently moves the anchor.

`plainText` is not `mdast-util-to-string` over the whole tree. That concatenates every descendant with no delimiter, so a heading's last word fuses with the next paragraph's first: "Caching StrategyThis project…". Postgres tokenises the pair as one word, which makes the text on both sides of every block boundary unsearchable and garbles snippets. The parser recurses until a node's children are inline, then flattens, joining blocks with a blank line.

</details>

## Search

Search is the one part that still uses Postgres, because it is the one part whose cost scales with how much documentation exists. `platform."docsPages"` holds `path`, `title`, `description` and `plainText` alongside a generated `tsvector` weighting title `A`, description `B` and body `C` — so page bodies are searchable, and a title match outranks a body match. `searchDocs` queries it with `websearch_to_tsquery`, ranks with `ts_rank`, and builds snippets with `ts_headline`.

The build does not write that index. `pnpm devtools docs index` pushes the compiled artifact into the database, and both deploy scripts run it ahead of every release — see [Local preview](/docs/toolkit/infrastructure/docs-system/preview) for pointing it at your own stack.

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

Platform is its only consumer, which makes it tempting. But `docs` would have to depend on `platform` to run the compiler, and `platform` already depends on `docs` for the parsed output — a cycle that dependency-ordered builds cannot resolve. A separate package is what breaks it.

</details>

<details>
<summary>What this replaced</summary>

Docs used to be ingested from the GitHub API into three tables — `docsRepos`, `docsBranches`, `docsPages` — by a push-webhook sync, then served through `"use cache"` and `revalidateTag`. That design existed because docs lived in repositories deploying on a different cadence than the site, which stopped being true once everything moved into this monorepo.

The invalidation half never worked anyway: the Cloudflare adapter leaves `tagCache` at `"dummy"`, so every `revalidateTag` call was a no-op. Nothing in the repo calls it today either.

Per-branch documentation previews went away with the sync. A branch preview is now a preview deployment of the whole site from that branch, docs included.

</details>
