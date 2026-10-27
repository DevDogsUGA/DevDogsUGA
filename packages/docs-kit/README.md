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

The two CLIs' command lists come from running `--help --json`. devtools runs
from this workspace's own build (`packages/devtools`, built before the docs
because the docs depend on it), falling back to `pnpm devtools`; backstage
runs as `pnpm backstage` from the repo root, so it is checked against the
latest publish. If a list cannot be loaded the build fails; there
is no silent skip. To check against a build that is not published yet, set
`DOCS_KIT_DEVTOOLS_CMD` / `DOCS_KIT_BACKSTAGE_CMD` to the command that runs it
(`DOCS_KIT_DEVTOOLS_CMD="node /path/to/devtools.mjs"`).

Each page ships as HTML rendered at build time (Shiki, KaTeX, GitHub alerts),
along with its headings and search text.

## Trust boundary: club docs and project docs

Two compile modes, because two kinds of author.

**Trusted** (`compileDocs`, the `docs-kit` binary): the club's own `docs/`,
reviewed in pull requests here. Author HTML and SVG still go through an
allowlist (`src/html-policy.ts`), not a blocklist; `class` and `id` are the
extras trusted pages get. Anything off the list fails the build with the file,
line and construct. Nothing is stripped silently.

**Untrusted** (`compileUntrustedDocs(dir, { project })`, `src/untrusted.ts`):
documentation fetched from a project's repository. The contract:

- Input is Markdown (`.md`), image assets (`png jpg jpeg gif webp avif svg`)
  and one optional `docs.manifest.json` (`version: 1`, `name`, `description`;
  unknown keys fail). Any other file type fails the build.
- It never runs the project's scripts, never installs its dependencies, never
  loads its plugins, and reads no project config that changes how the compiler
  behaves. The compiler, plugin list and policy are this package's. Frontmatter
  is YAML data only (`---js` is refused, not evaluated) and may set only
  `name description order section steps os`.
- Every path is checked with `lstat`: symlinks, special files, `..`, absolute
  paths, dotfiles and unusual names are refused, as are a `_shared` folder,
  files over the size caps, and more files, pages, bytes or folder depth than
  `DEFAULT_UNTRUSTED_LIMITS`. Files are opened with `O_NOFOLLOW`; the verified
  bytes are copied into a private temporary directory and compiled from there,
  so the source tree is not read again after it was checked.
- Images must be files inside the docs directory that match their type's
  signature. SVG assets and inline SVG use the same allowlist (no script,
  `foreignObject`, animation, `style`, `image`, external `use`/`href`).
- Links: only `http`, `https` and `mailto`, plus links to the project's own
  pages. External links get `rel="noopener noreferrer nofollow"`. External and
  `data:` images, `class`, `id` (except on elements inside an inline SVG, never
  its root), `style`, forms, iframes, objects and `data:` URLs are refused.
- It does not run the link check or the `pnpm` command check (the latter
  shells out) and writes nothing outside a temporary directory it removes.

Fetching a source commit, building candidates and previews, and publishing are
not in this package; they hand it a directory that was already fetched, with
no credentials in the environment.

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

## Requirement for the publishing stage (H2)

Approved relative asset references (`![x](a.png)`, `<img src="sub/x.png">`) are
validated against the page's folder in the docs tree but are emitted still
relative; the browser would resolve them against the page route, which differs
for a folder's `index.md`. H2 must rewrite approved asset references to
absolute content-addressed URLs (the sha256 is already computed) when it
serves them.
