# @devdogsuga/devtools

Contributor CLI: database, moderation checks, and OAuth setup — plus env sync
and the deploy steps CI runs.

```bash
pnpm devtools                # no arguments: a menu covering every command
pnpm devtools link                 # boot the local stack, or --remote to link a project
pnpm devtools reset                # replay migrations, then seeds, then regenerate types
pnpm devtools qr <url>             # a QR code in the attendance-poster style, as svg + png
```

The menu is generated from the same command tree the argv parser walks, so
there is no second list to fall out of step — reach for `--help` at any level
rather than a table here.

`qr` reproduces `apps/platform/public/attendance/qr.svg` from its defaults —
`--out poster.jpg` or `--format svg,png,webp,avif,tiff` pick the files, and
`--help` lists the styling flags with the reference's value for each.

[API reference](https://devdogsuga.org/docs/toolkit/reference/api/devtools) ·
[Quickstart](../../docs/monorepo/guides/quickstart.md)
