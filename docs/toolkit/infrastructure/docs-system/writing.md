---
name: Writing Docs
description: The rules for a docs page — front matter, sections, shared pages, length budgets, collapsibles, variants, and the markdown syntax that renders.
order: 2
section: infrastructure
---

# Writing Docs

Every page under `docs/` follows the same contract: front matter that names and places it, a length budget it stays under, and collapsibles used for the four things collapsibles are for. Read this before adding or editing one. For how the markdown becomes a page, see [the docs system](./index.md); to see your change rendered, [local preview](./preview.md).

## Where the file goes

`docs/` is grouped by project: **each immediate subfolder is one project** (`_shared` is the one exception, below), and it becomes the first segment of the URL. Everything below it is the page path.

```
docs/
  toolkit/
    index.md                       → /docs/toolkit/index
    infrastructure/
      docs-system/
        writing.md                 → /docs/toolkit/infrastructure/docs-system/writing
```

A URL is the path with `.md` dropped, `index.md` included; the bare `/docs/toolkit` redirects to it.

Adding a top-level folder with at least one `.md` creates a new project — it appears on `/docs` and in the sidebar's project selector automatically, nothing to register.

## Front matter

```md
---
name: Writing Docs
description: The rules for a docs page.
order: 10
section: infrastructure
---
```

- **`name`** — the page's title: its row in the sidebar, the browser tab, and its search result. Without it the title falls back to the first `# ` heading, then to the title-cased filename. Not breadcrumbs: that trail is the URL's own segments, title-cased.
- **`description`** — one sentence. It is the `<meta name="description">`, the blurb beside the page in folder listings and search results, and on a project's `index.md` the card subtitle on `/docs`. The lint warns about any page with none once the file passes 300 words of prose — `<details>` bodies included, not the visible count below.
- **`order`** — where the page sits among its siblings. See [Sidebar ordering](#sidebar-ordering).
- **`section`** — one of `getting-started`, `guides`, `infrastructure`, `reference`. A project's `index.md` takes no section: it is always "Overview". Every other page needs one, explicit or defaulted: a page under a `reference/` folder defaults to `reference`, anything else defaults to `guides`. `infrastructure` is maintainer/officer-only material — deploys, secrets, runbooks, OAuth/GitHub App setup, CI, the docs system itself.

Front matter is stripped before rendering, so it never appears in the page body.

## Shared pages

A page that says the same thing for more than one project lives once, under `docs/_shared/`, with a `mount` key instead of living in a project folder:

```md
---
name: Troubleshooting
description: Fixes for the errors contributors actually hit setting up.
section: getting-started
mount: [schedule-builder, study-group-finder, platform]
---
```

The compiler emits a copy of that file into each listed project, at the same relative path under `docs/_shared/`. `docs/_shared/getting-started/troubleshooting.md` mounted into `schedule-builder` renders at `/docs/schedule-builder/getting-started/troubleshooting`, with its own sidebar entry there like any other page. `_shared` itself is not a project — it has no card, no URL, no sidebar entry of its own.

A mounted page landing on a path its project already has for a real, unmounted page is a build error: rename one side rather than let one silently win.

When a page is _mostly_ shared but has one app-specific section — a setup step, a caveat that only applies to one app — split it: the shared part stays in `_shared`, and the app-specific part becomes its own ordinary page in that project's folder, linked from the shared one.

Each emitted copy carries `mountedFrom: "_shared/<path>"` (relative to `docs/_shared/`, no `.md`) in its parsed data — `null` on every page that isn't a mounted copy. It's how an edit link on a mounted page points back at the one file that's actually source, and how the link and command checks label an error against `_shared/<path>.md` instead of the project path it happened to fail under.

**Links name the file, not the URL.** A link to another docs page is a relative path to its Markdown file, extension included, so it works on github.com too; the compiler rewrites it to the site URL. A folder link ends in `/`. The path is resolved against the file's real location under `docs/`, so `../../platform/guides/migrations.md#some-anchor` reaches another project's page. An absolute `/docs/…` URL, or a relative path with no extension, fails the build: neither works on GitHub.

A `_shared` page is mounted into several projects, and its links have to mean the right thing in each:

- A link from one shared page to another (`./troubleshooting.md#some-anchor`) lands on the same mount: `schedule-builder`'s copy links `schedule-builder`'s troubleshooting page. The check resolves it once per mount.
- A project's own page links a mounted page by its shared file, since a mounted copy has no file of its own: `../_shared/getting-started/prerequisites.md` from `docs/workshops/index.md` lands on the workshops copy. The mounted path would 404 on GitHub, so the check refuses it and names the `_shared` path to use.
- `?project=<slug>` names a specific project's copy: `../_shared/guides/stack/db.md?project=platform`. GitHub ignores the query.
- A shared page must not link to a page that exists in only one of its mounts. Describe it in prose, or put the link in a `data-project` block ([Variants](./variants.md)) so it only exists in the copy that can reach it.

## How long a page gets to be

Counted in **visible words** — prose outside every `<details>`, code not counted:

| Page           | Budget |
| -------------- | ------ |
| Project index  | 350    |
| Task or how-to | 600    |
| Concept        | 900    |
| Anything, ever | 1500   |

Only the last row is machine-enforced, along with a 400-word cap per collapsible. Past 1500 the page splits — folding half of it into a fold it did not need is not the fix. The lint runs on every build, so `pnpm dev` prints the warning count; `pnpm --filter @devdogsuga/docs exec docs-kit check` prints the detail.

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
- **The summary line is a question or an explicit label** — "Why not a Postgres advisory lock?", "Every registered language". Never "More" or "Details".

Three collapsibles per `##` section at most, each under 400 words. Rationale goes inline, or under a closing `## Why it's like this` section, which may hold five.

## Sidebar ordering

Within a project, the sidebar is grouped by `section` in a fixed order — Overview, Getting started, Guides, Infrastructure, Reference — and only then by the file tree within each section.

Within a section, `index.md` (or `readme.md`) sorts first, then whatever `order` says, then **alphabetically by title** — not by filename. A page that declares no `order` sits at **100**, the middle of the range: a smaller number promotes a page above the pages nobody has numbered, a larger one demotes it below them. The numbers are only ever compared against the page's own siblings within the same section, so the same value means something different in each one.

<details>
<summary>How does a folder inside a section get its position?</summary>

A folder is an ordinary row, placed by a number it does not carry itself:

1. the `order` on its own `index.md`, which is the deliberate way to move it;
2. otherwise the **smallest** `order` anything inside it declares, which lands it where its contents begin;
3. otherwise nothing, and it sorts at the default like any other row.

An unnumbered page counts at the default for rule 2, and the folder takes the smaller of the two.

</details>

<details>
<summary>Where does <code>/docs/&lt;project&gt;</code> land?</summary>

It renders nothing of its own — it redirects to the first page under the project. An `index.md` at the project root always wins that, because an index page leads its folder whatever its number says, and every project in `docs/` has one — so every one of those URLs redirects to `/docs/<project>/index` today.

So `order` decides nothing up there right now. It would if a project lost its root `index.md` — the redirect would fall through to whichever page the ordering left first, and renumbering could then move a URL people have bookmarked. Give a project an index page and that cannot happen.

</details>

## Folder settings and courses

A folder takes its directory's name unless it has settings: a nested `index.md` with front matter (`name`, `order`, `steps`) and **no body**. It names and orders the folder, and is never a page.

`steps: true` makes the folder a course: its pages are steps, each ending in a pager with a "Mark as done" button, and the sidebar ticks off finished ones. `steps` anywhere else is a build error.

## Scheduling a page

`scheduled: 2026-10-05T18:00:00-04:00` in a page's front matter, or in a folder's settings, hides it until that time, with no deploy needed. A page inherits its folder's time and may only set a later one.

<details>
<summary>What "hidden" covers, and the rules</summary>

The time needs a timezone (`Z` or an offset). A bad one, or a page earlier than its folder, fails the build.

Until the time passes, everything about the page is hidden and its URL returns 404: the sidebar, the course pager, folder listings, the top-nav menu, search, the sitemap and the link card. The one exception is the docs landing page, which lists what is coming ("Workshop: Supabase: Oct 5") without a link. Search picks the time up from `devtools docs index`, so re-index after changing one.

Anyone with the **Preview docs** permission can read scheduled pages early at `/preview/docs/<project>/…`, where they are marked with the time they go live. It is linked from the console, is never cached, and returns 404 to everyone else.

</details>

## Supported syntax

Standard GitHub Flavored Markdown renders — headings, tables, task lists, blockquotes, code fences, autolinks. Beyond that:

**Code blocks** take a language tag — `typescript`, `bash`, `sql` — and are highlighted by [Shiki](https://shiki.style). An unregistered language falls back to plain text silently rather than failing the build, so check the block rendered. A fence tagged with the extra word `nocheck` (for example ` ```bash nocheck `) is skipped by the command check described in [the docs system](./index.md#checks) — use it for example output or a command from a tool this repo doesn't have, never to silence a check on a command that really should exist.

**File diffs**: a top-level ` ```diff file=<path> ` fence around a unified diff renders as a diff viewer.

**Copyable tables**: inside `:::copyable`, a table cell holding one code span gets a copy button, for values readers paste elsewhere.

```md
:::copyable

| Setting    | Value               |
| ---------- | ------------------- |
| Identifier | `custom:devdogsuga` |

:::
```

**Callouts** are GitHub-style blockquotes — `> [!NOTE]`, `> [!WARNING]`, `> [!TIP]` on the first line, the body on the lines below.

**Math** renders via KaTeX: `$inline$` and `$$display$$`.

**Raw HTML** is passed through. Prefer markdown where it can say the same thing.

**Links** between docs pages are relative `.md` paths, as [Shared pages](#shared-pages) describes. External URLs and anything in a code fence are left alone:

```md
See the [local preview](./preview.md) page, or the [migrations guide](../../../platform/guides/migrations.md#some-anchor).
```

Anchor links work; heading ids are GitHub-style slugs of the heading text.

<details>
<summary>Why can Shiki load any language now?</summary>

Rendering used to happen in the platform, per request, through `react-markdown` — and the Workers runtime forbids `WebAssembly.compile()`, so that renderer ran Shiki on its JavaScript regex engine with a hand-registered, hand-imported list of grammars. That constraint is gone now that rendering happens in `@devdogsuga/docs-kit`, at build time, in Node: the stock `@shikijs/rehype` plugin runs on Shiki's Oniguruma engine and loads any grammar on demand (`lazy: true`), so an unregistered language tag is no longer a build-time list to edit — it's just a language Shiki hasn't loaded yet, and `fallbackLanguage: "text"` is what a genuinely unsupported tag falls back to silently.

</details>

## Variants

Tabs and blocks that differ by project, platform or Supabase setup are `<details>` elements: [Variants](./variants.md).

## Why it's like this

<details>
<summary>Why does the length check warn instead of failing the build?</summary>

A docs lint that fails the build teaches exactly one lesson — how to get under the threshold — and most of the ways under a word budget are worse than the page that tripped it: detail deleted rather than moved, a paragraph folded into a `<details>` where nobody will look for it.

So the prose check reports and stops there; nothing in it sets an exit code. The counterweight is where the count gets printed. A warning behind a command someone has to think to run is a warning nobody reads, so the bare `docs-kit` — the one every `pnpm dev` and every `@devdogsuga/docs` build already runs — prints the number on its own summary line and points at `docs-kit check` for the detail.

The link and command checks are the opposite call, deliberately: a broken link or a renamed command is not a judgement call about how to phrase something, it is just wrong, so those fail the build rather than merely being reported.

Generated pages under `reference/` are skipped whole by the prose check. A generated page is an enumeration: it is as long as the code it describes, and no author chose any of it.

</details>
