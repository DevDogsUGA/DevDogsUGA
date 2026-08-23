---
name: Writing Docs
description: The rules for a docs page — front matter, length budgets, collapsibles, sidebar ordering, and the markdown syntax that renders.
order: 10
---

# Writing Docs

Every page under `docs/` follows the same contract: front matter that names it, a length budget it stays under, and collapsibles used for the four things collapsibles are for. Read this before adding or editing one. For how the markdown becomes a page, see [the docs system](/docs/monorepo/guides/docs-system); to see your change rendered, [local preview](/docs/monorepo/guides/docs-system/preview).

## Where the file goes

`docs/` is grouped by project: **each immediate subfolder is one project**, and it becomes the first segment of the URL. Everything below it is the page path.

```
docs/
  monorepo/
    index.md                       → /docs/monorepo/index
    guides/
      docs-system/
        writing.md                 → /docs/monorepo/guides/docs-system/writing
```

A URL is the path with `.md` dropped, `index.md` included; the bare `/docs/monorepo` redirects to it.

Adding a top-level folder with at least one `.md` creates a new project — it appears on `/docs` and in the sidebar's project selector automatically, nothing to register.

## Front matter

Three keys, on every page:

```md
---
name: Writing Docs
description: The rules for a docs page.
order: 10
---
```

- **`name`** — the page's title: its row in the sidebar, the browser tab, and its search result. Without it the title falls back to the first `# ` heading, then to the title-cased filename. Not breadcrumbs: that trail is the URL's own segments, title-cased, so this page reads `Monorepo / Guides / Docs System` whatever the front matter says.
- **`description`** — one sentence. It is the `<meta name="description">`, the blurb beside the page in folder listings and search results, and on a project's `index.md` the card subtitle on `/docs`. The lint warns about any page with none once the file passes 300 words — the whole file, `<details>` bodies included, not the visible count below.
- **`order`** — where the page sits among its siblings. See [Sidebar ordering](#sidebar-ordering).

Front matter is stripped before rendering, so it never appears in the page body.

## How long a page gets to be

Counted in **visible words** — words outside every `<details>`:

| Page           | Budget |
| -------------- | ------ |
| Project index  | 350    |
| Task or how-to | 600    |
| Concept        | 900    |
| Anything, ever | 1500   |

Only the last row is machine-enforced, along with a 400-word cap per collapsible. Past 1500 the page splits — folding half of it into a fold it did not need is not the fix. The lint runs on every build, so `pnpm dev` prints the warning count; `pnpm --filter @devdogsuga/docs exec docs-build check` prints the detail.

Project state does not belong here: open questions, phase plans, spike results and rolling status live in notes, not `docs/`.

## Collapsibles

`<details>` is for exactly four things:

- **Deep mechanics** — how the thing works, under the part a reader has to use.
- **Full enumerations** — every flag, every scope, every registered language.
- **Rationale** — why this, and which alternative was rejected.
- **Rare paths** — rotation, break-glass, the first-time setup one person does once.

Never collapse a prerequisite, anything on the happy path, or a warning that bites by default. A reader who opens nothing has to still end up safe.

The shape:

```md
<details>
<summary>Why not STV?</summary>

The body, with a blank line above it and below it.

</details>
```

- **Blank lines are mechanical.** One after `</summary>`, one before `</details>` — without them CommonMark keeps the whole block as raw HTML and the body renders unparsed.
- **No markdown headings inside.** `parseDocFile` collects every heading into the page's TOC, so a heading in a fold is a TOC entry pointing at content the reader cannot see.
- **`<summary>` is raw HTML.** Write `<code>pnpm dev</code>`, not backticks.
- **The summary line is a question or an explicit label** — "Why not STV?", "Every Airtable token scope". Never "More" or "Details".

Three collapsibles per `##` section at most, each under 400 words. Rationale goes inline, or under a closing `## Why it's like this` section, which may hold five.

## Sidebar ordering

The sidebar is built from the file tree. Within each folder, `index.md` (or `readme.md`) sorts first, then whatever `order` says, then **alphabetically by title** — not by filename. A page that declares no `order` sits at **100**, the middle of the range: a smaller number promotes a page above the pages nobody has numbered, a larger one demotes it below them. The numbers are only ever compared against the page's own siblings, so the same value means something different in each folder.

**Sections are always last.** A **top-level** folder is drawn as a section heading, and every section heading comes below every loose page in the project — this is the sidebar's own layout and no `order` overrides it. What `order` decides up there is which section precedes which, and the only way to say it is an `order` on the section's own `index.md`. Sections that say nothing sort by name.

<details>
<summary>Why a number buried inside a section is ignored up here</summary>

`platform/reference/server-actions.md` carries `order: 1`, meaning "read this first _of everything in reference/_". Reading that as a claim about the guides beside it would hoist the whole generated reference above Getting Started, so the top level only ever reads a section's own `index.md`.

</details>

<details>
<summary>How a folder <em>inside</em> a section gets its position</summary>

Below the top level a folder is an ordinary row, and it is placed by a number it does not carry itself:

1. the `order` on its own `index.md`, which is the deliberate way to move it;
2. otherwise the **smallest** `order` anything inside it declares, which lands it where its contents begin — the generated `reference/server/` folder follows the `reference/server.md` page because the pages inside it start numbering just after that page does;
3. otherwise nothing, and it sorts at the default like any other row.

An unnumbered page counts at the default for rule 2, and the folder takes the smaller of the two. So a folder holding one unnumbered page and one page at `order: 1` answers 1 — the number wins because it is smaller — while a folder holding one unnumbered page and one page at `order: 300` answers 100, not 300, because the row a reader meets on opening it is the unnumbered one.

</details>

<details>
<summary>Where does <code>/docs/&lt;project&gt;</code> land?</summary>

It renders nothing of its own — it redirects to the first page under the project. An `index.md` at the project root always wins that, because an index page leads its folder whatever its number says, and every project in `docs/` has one — so every one of those URLs redirects to `/docs/<project>/index` today.

So `order` decides nothing up there right now. It would if a project lost its root `index.md` — the redirect would fall through to whichever page the ordering left first, and renumbering could then move a URL people have bookmarked. Give a project an index page and that cannot happen.

</details>

## Supported syntax

Standard GitHub Flavored Markdown renders — headings, tables, task lists, blockquotes, code fences, autolinks. Beyond that:

**Code blocks** take a language tag — `typescript`, `bash`, `sql` — and are highlighted by [Shiki](https://shiki.style). An unregistered language falls back to plain text silently rather than failing the build, so check the block rendered.

**Callouts** are GitHub-style blockquotes — `> [!NOTE]`, `> [!WARNING]`, `> [!TIP]` on the first line, the body on the lines below.

**Math** renders via KaTeX: `$inline$` and `$$display$$`.

**Raw HTML** is passed through. Prefer markdown where it can say the same thing.

**Links** between docs pages use **site paths**, not file paths — the `.md` extension is not part of the URL:

```md
See the [local preview](/docs/monorepo/guides/docs-system/preview) page.
```

Anchor links work; heading ids are GitHub-style slugs of the heading text.

<details>
<summary>Every registered language</summary>

`bash`, `css`, `dart`, `diff`, `graphql`, `html`, `http`, `java`, `javascript`, `json`, `jsx`, `markdown`, `python`, `sql`, `toml`, `tsx`, `typescript`, `yaml`.

The list is registered in `apps/platform/src/components/DocsMarkdown.tsx`, which builds its own Shiki highlighter on the JavaScript regex engine — the stock plugin compiles Oniguruma's Wasm at request time, and the Workers runtime forbids that outright. Adding a language means adding an import there.

</details>

## Why it's like this

<details>
<summary>Why does the length check warn instead of failing the build?</summary>

A docs lint that fails the build teaches exactly one lesson — how to get under the threshold — and most of the ways under a word budget are worse than the page that tripped it: detail deleted rather than moved, a paragraph folded into a `<details>` where nobody will look for it.

So the check reports and stops there; nothing in it sets an exit code. The counterweight is where the count gets printed. A warning behind a command someone has to think to run is a warning nobody reads, so the bare `docs-build` — the one every `pnpm dev` and every `turbo build` already runs — prints the number on its own summary line and points at `docs-build check` for the detail.

Generated pages under `reference/` are skipped whole. A generated page is an enumeration: it is as long as the code it describes, and no author chose any of it.

</details>
