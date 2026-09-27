---
name: docs-compiler
description: Three modes behind one binary — compile a folder of markdown, lint the hand-written pages, or regenerate the API reference from source.
order: 9
section: guides
---

# docs-compiler

`@devdogsuga/docs-compiler` is the compiler behind `docs/`. It is why that
package holds markdown and a manifest and no code at all: its `build` script
runs this binary. It ships as a published package from the sibling **Backstage**
repository — like `@devdogsuga/devtools` and `@devdogsuga/events` — so a fix to
the compiler itself is a Backstage change, not one here.

Three modes, one binary:

```
docs-compiler                    # compile the markdown in this folder into dist/
docs-compiler check              # lint the hand-written pages here
docs-compiler gen [--dry-run]    # regenerate the API reference from source
```

Those are the CLI's modes, not lines to paste. The bin is linked into
`docs/node_modules/.bin` and nowhere else, so typing the bare name gets you
`command not found` — see [Running it](#running-it) below for the forms that
work.

**Bare** takes no arguments and never will. The working directory is the content
root; the output is `dist/index.js` plus `dist/index.d.ts`, a typed data module
the platform app imports. Anything else added to this CLI has to leave that mode
exactly as it was.

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

`docs`' own `build` script is `docs-compiler build`, which runs `gen` and then
the bare compile, and skips both when no markdown file, manifest, lockfile or
generator source it would read has changed since the last successful build:

```bash
pnpm --filter @devdogsuga/docs build          # cached: `docs-compiler gen && docs-compiler`
pnpm --filter @devdogsuga/docs build --force  # bypass the cache
```

To run the compiler directly instead, from `docs/`:

```bash
cd docs && pnpm exec docs-compiler check                  # resolves the linked bin
cd docs && node ./node_modules/.bin/docs-compiler check   # no PATH at all
```

What the rules mean for a page you are writing is
[Writing docs](/docs/toolkit/infrastructure/docs-system/writing); how a page reaches
the site is [the docs system](/docs/toolkit/infrastructure/docs-system).
