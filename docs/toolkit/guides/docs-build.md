---
name: docs-build
description: Three modes behind one binary — compile a folder of markdown, lint the hand-written pages, or regenerate the API reference from source.
order: 9
---

# docs-build

`@devdogsuga/docs-build` is the compiler behind `docs/`. It is why that package
holds markdown and a manifest and no code at all: its `build` script is this
binary, run bare.

Three modes, one binary:

```
docs-build                    # compile the markdown in this folder into dist/
docs-build check              # lint the hand-written pages here
docs-build gen [--dry-run]    # regenerate the API reference from source
```

Those are the CLI's modes, not lines to paste. The bin is linked into
`docs/node_modules/.bin` and nowhere else, so typing the bare name gets you
`command not found` — see [Running it](#running-it) below for the two forms
that work.

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

**`gen`** walks the monorepo's TypeScript and Dart sources and writes
`docs/<project>/reference/`, which the bare mode then compiles like any other
page. It is a separate subcommand because it needs the whole repo, where the
bare mode only ever needs the folder it stands in. Doc-comment coverage is
reported on every run and never enforced, and an extractor that cannot read a
file warns and carries on.

## Running it

Both forms run from the content root, and both work:

```bash
cd docs && pnpm exec docs-build check                  # resolves the linked bin
cd docs && node ../packages/docs-build/bin/docs-build.mjs check   # no PATH at all
```

That `bin/` file is a committed one-line shim rather than a pointer straight at
`dist/`. pnpm silently skips linking a bin whose target is missing, so on a
fresh checkout the direct pointer left CI with a bare `command not found`; the
shim always exists, and by the time anything runs it turbo has built `dist/`.

What the rules mean for a page you are writing is
[Writing docs](/docs/monorepo/guides/docs-system/writing); how a page reaches
the site is [the docs system](/docs/monorepo/guides/docs-system). Every export
is in the generated
[`@devdogsuga/docs-build`](/docs/toolkit/reference/api/docs-build) reference.
