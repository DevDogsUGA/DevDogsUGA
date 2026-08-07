# Documentation System Architecture

This page describes how documentation gets from a markdown file in this repo to a rendered page and a search result.

## The short version

Docs are **compiled into the app at build time**. `docs/` is a workspace package whose build parses every markdown file into a typed module; the docs routes import that module and prerender every page. Postgres holds nothing but the full-text search index.

There is no GitHub API call, no webhook, no cache invalidation, and no runtime filesystem access.

## Two packages

The content and the code that processes it are deliberately separate.

**`docs/` is `@devdogsuga/docs`** — a pnpm workspace package holding _only_ markdown and a `package.json`. Its entire build script is `docs-build`. No TypeScript, no config, nothing to read past the folder of `.md` files.

**`packages/docs-build/` is `@devdogsuga/docs-build`** — the compiler. It exposes a `docs-build` CLI that treats its working directory as the content root, walks it for `*.md`, parses each file, and emits `dist/index.js` plus a hand-written `dist/index.d.ts`. Emitting the declarations directly (rather than running `tsc`) is what lets the content package stay free of a TypeScript toolchain.

Being a package is what makes the rest work:

- `turbo watch` sees markdown edits at package granularity, because the markdown _is_ a package. No bespoke file watcher exists.
- The platform depends on `@devdogsuga/docs`, so the existing `dependsOn: ["^build"]` in `turbo.json` produces the artifact for `build`, `typecheck`, `lint` and `test` with no extra task, and Turborepo's remote cache restores it in CI.

> [!NOTE]
> The compiler cannot live in the platform app, tempting as that is given platform is its only consumer. `docs` would have to depend on `platform` to run it, and `platform` already depends on `docs` for the parsed output — a cycle that turbo's `^build` ordering cannot resolve. A separate package is what breaks it.

`parseDocFile` (`packages/docs-build/src/parse.ts`) is a `unified` + `remark-parse` pass that extracts, per file: `title`, `description`, `frontmatter`, `headings` (id/title/depth, slugged with `github-slugger` so ids match the anchors generated at render time), `content` (markdown with front matter stripped), and `plainText` (the document flattened, for search).

## Rendering

`src/server/docs/queries.ts` is a thin layer over the imported constants — `getDocsProjects()`, `getDocsTree()`, `getDocsPage()`. Every call is an in-memory lookup; none is async, and none touches a cache or database.

| Route                       | Renders                               |
| --------------------------- | ------------------------------------- |
| `/docs`                     | the project cards, from `projects[]`  |
| `/docs/[project]`           | redirects to the project's first page |
| `/docs/[project]/[...slug]` | the page itself                       |

`generateStaticParams` enumerates every page, so all of them are prerendered at build time. A path that isn't enumerated renders on demand and 404s via `notFound()` — safe on Workers, because the lookup reads a bundled constant rather than the filesystem.

Markdown is rendered by `DocsMarkdown` (`src/components/DocsMarkdown.tsx`) through `react-markdown`'s `MarkdownAsync` with remark/rehype plugins: GFM, math, smartypants, emoji, GitHub alerts, raw HTML, heading slugs and autolinks, Shiki highlighting, and KaTeX.

That component carries `"use cache"` with `cacheLife("max")`. This is required rather than an optimisation: something in the plugin chain reads `Date.now()`, which Cache Components forbids during a prerender unless it happens inside a cached function. It is also accurate — the output is a pure function of the markdown source — and since every docs page is prerendered, the entry is baked into the static output rather than needing a runtime cache store.

## Search

Search is the one part that still uses Postgres, because it is the one part whose cost scales with how much documentation exists. `platform."docsPages"` holds `path`, `title`, `description`, `plainText`, and a generated `tsvector`:

```sql
setweight(to_tsvector('english', coalesce(title, '')),       'A') ||
setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
setweight(to_tsvector('english', "plainText"),               'C')
```

So page bodies are searchable, and a title match outranks a body match. `searchDocs` (`src/server/search/docsSearch.ts`) queries it with `websearch_to_tsquery` — quoted phrases, `OR`, `-exclusions` — ranks with `ts_rank`, and generates snippets with `ts_headline`.

Two reasons this stayed in Postgres rather than becoming an in-memory JS index:

- A JS index scales with total body bytes and is rebuilt on **every Worker isolate cold start**. A GIN-indexed tsvector is indifferent to corpus size.
- `ts_headline` is stem-aware. Search `caching`, and it highlights `cache` — the word that actually matched. A substring highlighter would find nothing to mark.

`ts_headline` output is wrapped in control-character sentinels rather than `<mark>` directly, then HTML-escaped and substituted, so document content can never inject markup into the search dialog.

### Populating the index

`pnpm docs:index` (`scripts/index-docs.ts`) reads the same build-time artifact, upserts every page by `path`, and deletes rows whose path no longer exists — one transaction. The `search` column is `generated always`, so the script writes only title/description/plainText and Postgres recomputes the vector.

It refuses to run against a non-local database without `--force`, because it is destructive by design: pointed at production from a working copy, it would replace the live index with whatever is checked out. `pnpm cf:deploy:staging` and `pnpm cf:deploy:production` pass `--force` as part of deploying.

## What this replaced

Docs used to be ingested from the GitHub API into three tables (`docsRepos`, `docsBranches`, `docsPages`) by a push-webhook sync, and served through `"use cache"` + `revalidateTag`. That design existed because docs lived in repositories that deployed on a different cadence than the site — which stopped being true once everything moved into this monorepo.

It was also inert in production: the Cloudflare adapter is configured without an incremental cache or tag cache, so every `revalidateTag` call was a no-op and every `"use cache"` entry was recomputed per request. Making it work would have meant provisioning R2 and D1. Building the docs instead removed the requirement.

Per-branch documentation previews went away with it. A branch preview is now a preview deployment of the whole site from that branch, docs included.
