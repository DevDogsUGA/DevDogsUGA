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
- **`order`** — where the project sits among the cards on `/docs`, in the sidebar's project selector, and in the top nav's docs menu, all three of which list projects in the same order. Projects that declare no `order` sit at 100 and sort by name; none does today, so the listing is alphabetical until one opts in.

On ordinary pages `description` still feeds search results and page metadata, and `order` places the page in the sidebar — see [Sidebar ordering](#sidebar-ordering) — so both are worth adding to substantial pages. Front matter is stripped before rendering, so it never appears in the page body.

## Sidebar ordering

The sidebar is built from the file tree. Within each folder, `index.md` (or `readme.md`) sorts first, then whatever `order` says, then **alphabetically by title** — not by filename. A page that declares no `order` sits at **100**, the middle of the range: a smaller number promotes a page above the pages nobody has numbered, a larger one demotes it below them. The numbers are only ever compared against the page's own siblings, so the same value means something different in each folder.

### Sections are always last

A **top-level** folder is drawn as a section heading, and every section heading comes below every loose page in the project — this is the sidebar's own layout and no `order` overrides it. That is why `reference/` sits under the hand-written guides rather than between Navigation System and Reporting, and it was already true before `order` existed.

What `order` decides up there is which section precedes which, and the only way to say it is an `order` on the section's own `index.md`. Sections that say nothing sort by name. A number buried inside a section is deliberately ignored at this level: `reference/server-actions.md` carries `order: 1` meaning "read this first _of everything in reference/_", and reading that as a claim about the guides beside it would hoist the whole generated reference above Getting Started.

### Folders inside a section

Below the top level a folder is an ordinary row, and it is placed by a number it does not carry itself:

1. the `order` on its own `index.md`, which is the deliberate way to move it;
2. otherwise the **smallest** `order` anything inside it declares, which lands it where its contents begin — the generated `reference/server/` folder follows the `reference/server.md` page because the pages inside it start numbering just after that page does;
3. otherwise nothing, and it sorts at the default like any other row.

An unnumbered page counts at the default for rule 2, and the folder takes the smaller of the two. So a folder holding one unnumbered page and one page at `order: 1` answers 1 — the number wins because it is smaller — while a folder holding one unnumbered page and one page at `order: 300` answers 100, not 300, because the row a reader meets on opening it is the unnumbered one.

### One more place the number is read

`/docs/<project>` renders nothing of its own — it redirects to the first page in the tree, descending into folders in the order above. A project with an `index.md` always lands there, because an index page leads its folder. A project without one lands wherever the ordering puts it, so renumbering can move that URL: `/docs/toolkit` opens the components reference because `reference/components/` is numbered ahead of `reference/api/`.

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
