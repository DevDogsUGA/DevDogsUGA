# @devdogsuga/docs-kit

Compiles a folder of markdown into a typed data module, checks it, and writes the docs search index. A private workspace package, used from source.

Five modes, one binary. `docs-kit build` is the whole of `docs/`'s build
step, which is why that package holds no code: it runs `gen` and then the bare
mode, and skips both when nothing either reads has changed since the last
successful build. `--force` (or `DOCS_FORCE_REBUILD=1`) rebuilds anyway.

Bare `docs-kit` compiles the markdown in the working directory into
`dist/`. The other two are what you run by hand, both from `docs/`:

```bash
pnpm exec docs-kit check   # lint the hand-written pages for length and collapsible defects
pnpm exec docs-kit gen     # regenerate the reference sections from each source tree
```

`pnpm exec` is what puts the bin on `PATH`; it is linked into
`docs/node_modules/.bin` and nowhere else, so the bare name is
"command not found".

`docs-kit index` writes the pages in `dist/` to the search index with one call to
`platform.replace_docs_index`, using the `API_URL` and `SECRET_KEY` that
`with-env` loads. `@devdogsuga/docs` runs it as `populate:search`; the platform's
dev server runs it after every docs change.

`check` is warn-only and always exits 0; `gen --dry-run` writes nothing.
`gen` only covers shared packages (the `toolkit` project) — apps no longer
get a generated reference.

The bare mode (and so `build`) also runs two checks that DO fail the build: broken
internal links (a link to another page is a relative path to its `*.md` file,
or to a folder ending in `/`, which GitHub follows too; the build rewrites it
to the site URL. It has to resolve, mounting from `docs/_shared/**` included,
and an absolute `/docs/…` URL or an extensionless link is itself an error) and a documented
`pnpm devtools …` / `pnpm backstage …` / `pnpm --filter … <script>` /
`pnpm run <script>` that does not match a real command or script. Opt a fenced
sample out with a `nocheck` fence-info word (` ```sh nocheck `).

The two CLIs' command lists come from running `pnpm devtools --help --json` and
`pnpm backstage --help --json` from the repo root, so the docs are checked
against the latest publish. If a list cannot be loaded the build fails; there
is no silent skip. To check against a build that is not published yet, set
`DOCS_KIT_DEVTOOLS_CMD` / `DOCS_KIT_BACKSTAGE_CMD` to the command that runs it
(`DOCS_KIT_DEVTOOLS_CMD="node /path/to/devtools.mjs"`).

Each page ships as HTML rendered at build time (Shiki, KaTeX, GitHub alerts),
along with its headings and search text.

## Variants

A page can differ by project and by the reader's setup, written as `<details>`
elements (GitHub renders them as labelled collapsibles; docs-kit reads their
attributes). Keep a blank line after the `<summary>` and before `</details>`:

````md
<details data-project="study-group-finder">
<summary>For Study Group Finder</summary>

Build for Android first.

</details>

<details name="os" data-value="macos">
<summary>macOS</summary>

Install Homebrew.

</details>

<details name="os" data-value="linux wsl">
<summary>Linux and Windows (WSL2)</summary>

Use apt.

</details>

```bash os=macos
brew install fnm
```

```bash os="linux wsl"
curl -fsSL https://fnm.vercel.app/install | bash
```
````

`data-project` is settled per mounted copy at build time. Consecutive details
sharing a `name` (tabs) and `data-os`/`data-supabase` ship every variant, and
the site shows the reader's pick. Groups are `os` (`macos`, `linux`, `wsl`, `windows`) and
`supabase` (`hosted`, `local`). `windows` means native Windows and only exists
in a project whose `index.md` lists it under `os:`. The build fails when a
tab set leaves a value uncovered, covers one twice, or puts a heading inside
a tab.

`:::copyable` isn't a variant: it puts a copy button on each cell of the
tables inside it that is nothing but one code span, for values a reader
pastes somewhere else.

[API reference](https://devdogsuga.org/docs/toolkit/reference/api/docs-kit) ·
[Docs system](https://devdogsuga.org/docs/toolkit/guides/docs-kit)
