# @devdogsuga/docs-build

Compiles a folder of markdown into a typed data module.

Three modes, one binary. Bare `docs-build` compiles the markdown in the working
directory into `dist/` — that is the whole of `docs/`'s build step, which is why
that package holds no code. The other two are what you run by hand, both from
`docs/`:

```bash
pnpm exec docs-build check   # lint the hand-written pages for length and collapsible defects
pnpm exec docs-build gen     # regenerate the reference sections from each source tree
```

`pnpm exec` is what puts the bin on `PATH`; it is linked into
`docs/node_modules/.bin` and nowhere else, so the bare name is
"command not found".

`check` is warn-only and always exits 0; `gen --dry-run` writes nothing.

[API reference](https://devdogsuga.org/docs/toolkit/reference/api/docs-build) ·
[Docs system](../../docs/monorepo/guides/docs-system/index.md)
