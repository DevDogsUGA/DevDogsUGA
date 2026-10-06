---
name: Variants
description: Tabs and blocks that differ by project, platform or Supabase setup.
order: 3
section: infrastructure
---

# Variants

A page can differ by project or by the reader's setup. Both are written as `<details>` elements, so the same Markdown reads on github.com, where each one renders as a labelled collapsible, and on the site, where docs-kit turns them into tabs or conditional content. Every page still ships as pre-rendered HTML.

Three rules for the markup, because GitHub and docs-kit both need them to read the body as Markdown:

- A blank line after the `<summary>` line, and a blank line before `</details>`.
- `</details>` on its own line.
- A `<summary>` with a human label, which is what GitHub shows. Do not add `open`.

A `<details>` with none of `name`, `data-project`, `data-os` or `data-supabase` is an ordinary collapsible, and docs-kit leaves it alone.

**By project**, settled at build time. `data-project` keeps a block in that project's copy of a `_shared` page and drops it from every other copy. It takes one slug or several separated by spaces. Headings are allowed inside.

```md
<details data-project="study-group-finder">
<summary>For Study Group Finder</summary>

Build for Android first.

</details>
```

**By setup**, settled in the browser. The groups are `os` (`macos`, `linux`, `wsl`, `windows`) and `supabase` (`hosted`, `local`). Every variant ships; the reader's choice is a `data-os`/`data-supabase` attribute on the docs layout, set before first paint, and CSS hides the rest.

Consecutive `<details>` that share a `name` are one tab group, and `data-value` says which values each tab serves; it can list several. The tab strip uses the group's own labels, one button per value the project offers, so write the `<summary>` for GitHub readers.

```md
<details name="os" data-value="macos">
<summary>macOS</summary>

Install Homebrew.

</details>

<details name="os" data-value="linux wsl">
<summary>Linux and Windows (WSL2)</summary>

Use apt.

</details>
```

Leave a blank line between one tab's `</details>` and the next tab's `<details>`; without it they are one HTML block and neither parses.

Adjacent code blocks can tag their info string instead:

````md
```bash os=macos
brew install fnm
```

```bash os="linux wsl"
curl -fsSL https://fnm.vercel.app/install | bash
```
````

`<details data-os="windows">` shows a block for one setup only; no headings inside. `data-supabase` works the same way.

**`windows` means native Windows and is opt-in.** A project offers it only if its `index.md` front matter lists it: `os: [macos, linux, wsl, windows]`. In every other project's copy, a `windows`-only tab or block is dropped.

**The build fails** when a tab set leaves one of the project's values uncovered or covers one twice, on an unknown group, value, attribute or directive, on a variant `<details>` with no `<summary>`, body text glued to the summary, or no closing tag, and on a heading inside a tab or a `data-os`/`data-supabase` block. A reader would otherwise find an empty panel, or a table-of-contents entry pointing at something hidden.

The old `:::only{…}`, `:::tabs{…}` and `::tab{…}` directives are gone; the build rejects them. `:::copyable` is unchanged.
