# Writing Documentation

All documentation lives in this monorepo's `docs/` folder. This guide covers how to write, format, and organize markdown so it renders correctly on the live site.

## File structure

`docs/` is grouped by project: **each immediate subfolder is one project**, and it becomes the first segment of the URL. Everything below it is the page path.

```
docs/
  platform/
    index.md                     → /docs/platform
    getting-started.md           → /docs/platform/getting-started
    documentation-system/
      writing-docs.md            → /docs/platform/documentation-system/writing-docs
  schedule-builder/
    index.md                     → /docs/schedule-builder
```

Adding a new top-level folder with at least one `.md` file creates a new project. It appears on `/docs` and in the sidebar's project selector automatically — nothing to register.

## Page titles

The title appears in the sidebar, the browser tab, breadcrumbs, and search results. It is resolved in this order:

1. `name` in front matter, if present.
2. The document's first `# ` heading.
3. The title-cased filename, as a last resort.

In practice: **just start every file with a `# ` heading** and the title takes care of itself.

## Front matter

Front matter is optional and only meaningful on a project's `index.md`, where it supplies the project's card on `/docs`:

```md
---
name: Platform
description: The DevDogs web platform — the site, console, docs, and public APIs.
---

# DevDogs Website
```

- **`name`** — the project's display name, and the page's own title.
- **`description`** — the card subtitle on `/docs`, and the page description used for search results and `<meta name="description">`.

On ordinary pages `description` still feeds search results and page metadata, so it is worth adding to substantial pages. Front matter is stripped before rendering, so it never appears in the page body.

## Sidebar ordering

The sidebar is built from the file tree. Within each folder, `index.md` (or `readme.md`) sorts first and everything else follows **alphabetically by title** — not by filename. There is no ordering manifest; rename or retitle a page to move it.

## Supported syntax

### GitHub Flavored Markdown

Standard GFM is fully supported: headings, bold/italic, tables, task lists, blockquotes, inline code, fenced code blocks, and autolinks.

### Code blocks

Use a language tag for syntax highlighting, powered by [Shiki](https://shiki.style):

````md
```typescript
const greeting = (name: string) => `Hello, ${name}!`;
```
````

Highlighting is registered for `bash`, `css`, `diff`, `graphql`, `html`, `http`, `java`, `javascript`, `json`, `jsx`, `markdown`, `python`, `sql`, `toml`, `tsx`, `typescript` and `yaml`. Anything else falls back to plain text rather than failing the build.

### Admonitions (callouts)

GitHub-style blockquote callouts:

```md
> [!NOTE]
> This is a note. Use it for additional context.

> [!WARNING]
> This is a warning. Use it for things that could go wrong.

> [!TIP]
> This is a tip. Use it for recommended approaches.
```

### Math

LaTeX renders via KaTeX — `$inline$` and `$$display$$`.

### Raw HTML

Raw HTML is passed through and rendered. Prefer markdown where it can express what you need, but HTML is available when it cannot.

### Links

Link between docs pages using their **site paths**, not file paths — the `.md` extension is not part of the URL:

```md
See the [Getting Started](/docs/platform/getting-started) guide.
```

Anchor links to headings work as expected; heading ids are GitHub-style slugs of the heading text:

```md
See the [code blocks](#code-blocks) section above.
```

## How changes reach the site

Docs are compiled into the app at build time, so a docs change ships with a deploy like any other change — there is no webhook and nothing to invalidate. See [Architecture](/docs/platform/documentation-system/architecture) for the full pipeline, and [Local Preview](/docs/platform/documentation-system/local-preview) for the authoring loop.
