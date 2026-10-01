---
name: docs-kit
description: One binary for the docs — compile a folder of markdown, lint the hand-written pages, regenerate the API reference from source, or write the search index.
order: 9
section: guides
---

# docs-kit

`@devdogsuga/docs-kit` (`packages/docs-kit`) is the compiler behind `docs/`. It
is why that package holds markdown and a manifest and no code at all: its
`codegen` script runs this binary. It is a private workspace package used from
source, so a change to the compiler is an ordinary change in this repository.

Four modes, one binary:

```
docs-kit                    # compile the markdown in this folder into dist/
docs-kit check              # lint the hand-written pages here
docs-kit gen [--dry-run]    # regenerate the API reference from source
docs-kit index              # write dist/'s pages to the search index
```

Those are the CLI's modes, not lines to paste. The bin is linked into
`docs/node_modules/.bin` and nowhere else, so typing the bare name gets you
`command not found` — see [Running it](#running-it) below for the forms that
work.

**Bare** takes no arguments and never will. The working directory is the content
root; the output is `dist/index.js` plus `dist/index.d.ts`, a typed data module
the platform app imports. Each page ships pre-rendered — Shiki for code, KaTeX
for math, GitHub alerts, the variant directives described in
[Writing docs](/docs/toolkit/infrastructure/docs-system/writing#variants) — so
the platform app has no markdown renderer of its own; it drops the compiled
`html` string straight into the page. Anything else added to this CLI has to
leave that mode exactly as it was.

Bare mode also runs two checks that **fail the build**: every link between
docs pages has to resolve against pages that actually exist (mounted `_shared`
pages included), and every documented `pnpm devtools`, `pnpm --filter` or
`pnpm run` command inside a fenced code block has to name a real command or
package script. A fence tagged with the extra word `nocheck` opts a block out
of the second check — see
[Writing docs](/docs/toolkit/infrastructure/docs-system/writing#supported-syntax)
for the exact syntax.

**`check`** is the prose lint — page length, collapsible defects, missing
descriptions. It **warns and never fails**, and that is a decision rather than
an omission: most of the ways under a word budget are worse than the page that
tripped it, so it reports and stops there. The counterweight is that the bare
mode runs it too and prints the count on its summary line, because a warning
behind a command somebody has to think to run is a warning nobody reads. Pages
under a `reference/` segment are skipped whole — every rule is about a judgement
an author made, and a generated page had none.

**`gen`** walks the shared packages' TypeScript sources and writes
`docs/toolkit/reference/`, which the bare mode then compiles like any other
page. Only `toolkit` gets a generated reference — an app is not a published
package with a stable public surface the way `packages/*` is, so app-level
`reference/` directories have been removed rather than kept in sync by hand.
`gen` is a separate subcommand because it needs the whole repo, where the bare
mode only ever needs the folder it stands in. Doc-comment coverage is reported
on every run and never enforced, and an extractor that cannot read a file
warns and carries on.

## Running it

`docs`' own `codegen` script is `docs-kit build`, which runs `gen` and then
the bare compile, and skips both when no markdown file, manifest, lockfile or
generator source it would read has changed since the last successful build:

```bash
pnpm --filter @devdogsuga/docs codegen        # cached: `docs-kit gen && docs-kit`
pnpm --filter @devdogsuga/docs codegen --force  # bypass the cache
```

To run the compiler directly instead, from `docs/`:

```bash
cd docs && pnpm exec docs-kit check
```

What the rules mean for a page you are writing is
[Writing docs](/docs/toolkit/infrastructure/docs-system/writing); how a page reaches
the site is [the docs system](/docs/toolkit/infrastructure/docs-system).
