---
name: Variants
description: Tabs and blocks that differ by project, platform or Supabase setup.
order: 3
section: infrastructure
---

# Variants

A page can differ by project or by the reader's setup. Both are written as `remark-directive` blocks, and every page still ships as pre-rendered HTML.

**By project**, settled at build time. `:::only{project="study-group-finder"}` keeps a block in that project's copy of a `_shared` page and drops it from every other copy. Headings are allowed inside.

```md
:::only{project="study-group-finder"}
Build for Android first.
:::
```

**By setup**, settled in the browser. The groups are `os` (`macos`, `linux`, `wsl`, `windows`) and `supabase` (`hosted`, `local`). Every variant ships; the reader's choice is a `data-os`/`data-supabase` attribute on the docs layout, set before first paint, and CSS hides the rest. A tab's `value` can list several values.

```md
:::tabs{group="os"}
::tab{value="macos"}
Install Homebrew.
::tab{value="linux wsl"}
Use apt.
:::
```

Adjacent code blocks can tag their info string instead:

````md
```bash os=macos
brew install fnm
```

```bash os="linux wsl"
curl -fsSL https://fnm.vercel.app/install | bash
```
````

`:::only{os="windows"}` shows a block for one setup only; no headings inside.

**`windows` means native Windows and is opt-in.** A project offers it only if its `index.md` front matter lists it: `os: [macos, linux, wsl, windows]`. In every other project's copy, a `windows`-only tab or block is dropped.

**The build fails** when a tab set leaves one of the project's values uncovered or covers one twice, on an unknown group, value or directive, and on a heading inside a tab or an `only{os=…}` block. A reader would otherwise find an empty panel, or a table-of-contents entry pointing at something hidden.
