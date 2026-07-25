# Documentation System Architecture

This page describes the technical design of the DevDogs documentation system — how it fetches and caches content, how pages are rendered, how the preview tool works, and how changes propagate from GitHub to the live site.

## Rendering pipeline

All documentation pages use a single shared component: `DocPageContent` (`src/components/DocPageContent/`). It accepts raw markdown source and pre-computed headings, then renders using [Fumadocs UI](https://fumadocs.vercel.app) with the following plugins:

| Plugin              | Purpose                                                      |
| ------------------- | ------------------------------------------------------------ |
| `remark-gfm`        | GitHub Flavored Markdown (tables, task lists, strikethrough) |
| `remark-heading`    | Heading ID generation for anchor links                       |
| `remark-admonition` | `> [!NOTE]` / `> [!WARNING]` / `> [!TIP]` callouts           |
| `remark-code-tab`   | Code tab blocks                                              |
| `rehype-code`       | Shiki syntax highlighting with dual light/dark themes        |

`DocPageContent` is a pure renderer — it does not parse headings. Heading data (id, title, depth) comes from the cached manifest, ensuring the table of contents, search index, and sidebar tree all derive from the same source.

## No front matter

Markdown files are pure content. There is no YAML front matter. The page title is always the first `# ` heading; sidebar ordering and labels come from `meta.json` files placed alongside the markdown files.

## URL structure

Documentation URLs follow the pattern `/docs/{repo}/{branch}/{slug}`:

```
/docs/devdogs-website/main/getting-started
/docs/devdogs-website/main/contributing
```

Only files under the `docs/` directory of a repository are served. Branch names can contain slashes — the routing resolves the branch via longest-prefix matching against known branch names.

## Content delivery and caching

The docs system uses Next.js [Cache Components](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents) (`"use cache"` directive) for granular, per-file caching. Four independently cached layers compose at read time:

| Layer                 | Function                 | Cache tag                            | TTL                 |
| --------------------- | ------------------------ | ------------------------------------ | ------------------- |
| Per-file entries      | `getDocFileEntries()`    | `docs-search-{repo}-{branch}-{slug}` | `cacheLife("days")` |
| Per-branch tree       | `getDocTreeCached()`     | `docs-tree-{repo}-{branch}`          | `cacheLife("days")` |
| Per-repo branches     | `getDocBranchesCached()` | `docs-branches-{repo}`               | `cacheLife("days")` |
| Per-repo search index | `getDocsSearchIndex()`   | `docs-search-index-{repo}`           | `cacheLife("days")` |

All cache tag strings are defined in `src/server/manifest/cache-tags.ts` and shared between `cacheTag()` and `revalidateTag()` call sites — a typo becomes a compile-time error rather than a silent cache miss.

The per-file layer caches each markdown file's parsed headings, title, description, and breadcrumbs. When only one file changes, only that file's cache entry is invalidated — all other files remain cached.

Doc pages themselves use `"use cache"` at the page level, caching the entire rendered RSC payload. See the [caching overview](../caching) for the full picture.

**References:**

- [Next.js `"use cache"` directive](https://nextjs.org/docs/app/api-reference/directives/use-cache)
- [Next.js `cacheTag`](https://nextjs.org/docs/app/api-reference/functions/cacheTag)
- [Next.js `cacheLife`](https://nextjs.org/docs/app/api-reference/functions/cacheLife)

## GitHub webhook (ISR)

When a push is made to a repository, GitHub sends a webhook to `POST /api/github/docs-webhook`. The handler (`src/server/docs/revalidate.ts`):

1. Verifies the `X-Hub-Signature-256` HMAC signature using `GITHUB_WEBHOOK_SECRET`.
2. Parses the push event to extract the repo name, branch, and changed file paths.
3. Calls `revalidateTag()` for the affected cache tags.

| Event                            | Tags invalidated                          |
| -------------------------------- | ----------------------------------------- |
| Any push                         | `docsBranchesTag`, `docsSearchIndexTag`   |
| File added/removed under `docs/` | `docsTreeTag`, `docsSearchIndexTag`       |
| File modified under `docs/`      | `docsFileSearchTag`, `docsSearchIndexTag` |
| `meta.json` changed              | `docsTreeTag`, `docsSearchIndexTag`       |

### Registering the webhook

In GitHub → Organization Settings → Webhooks:

- **Payload URL**: `https://devdogsuga.uga.edu/api/github/docs-webhook`
- **Content type**: `application/json`
- **Secret**: value of `GITHUB_WEBHOOK_SECRET` in your environment
- **Events**: **Push** (covers branch pushes and PR merges)

### Environment variable

```
GITHUB_WEBHOOK_SECRET="<random string, at least 20 characters>"
```

Generate a secret with `openssl rand -hex 32`.

## Code organization

Documentation server code is consolidated in `src/server/docs/`:

| File            | Responsibility                                                          |
| --------------- | ----------------------------------------------------------------------- |
| `github.ts`     | Raw GitHub API calls (branches, tree, file content)                     |
| `tree.ts`       | Tree processing: meta.json parsing, ordering                            |
| `utils.ts`      | Shared string utilities (`toTitleCase`, `stripExt`)                     |
| `actions.ts`    | Server actions for sidebar (branch list, tree nodes, branch resolution) |
| `revalidate.ts` | Webhook-based cache invalidation                                        |

The `"use cache"` functions live in `src/server/manifest/docs-cache.ts` and compose the functions above.

## Sidebar metadata (`meta.json`)

`buildDocTree()` in `src/server/docs/tree.ts` processes the git tree. From it:

1. Collects all markdown files under `docs/`
2. Fetches `docs/meta.json` and `docs/**/meta.json`
3. Applies ordering, label overrides, and visibility filtering
4. Returns `{ entries, metaByFolder }`

The sidebar component receives `DocTreeNode[]` — a data-source-agnostic tree type shared between the remote docs sidebar and the local preview sidebar.

## Local preview

The preview server (`@devdogsuga/docs-preview`) is a lightweight Node.js HTTP + WebSocket server that:

- Returns a structured `DocTreeNode[]` from `GET /tree` (no client-side tree building needed)
- Serves raw file content from `GET /file?path=...`
- Broadcasts `{ type: "change" }` events over WebSocket when any `docs/` file changes

The preview pages (`/tools/docs`) call `fetchFile()` from `@devdogsuga/docs-preview/client`. A client component (`PreviewRefreshClient`) connects the WebSocket and calls `router.refresh()` on each change event.
