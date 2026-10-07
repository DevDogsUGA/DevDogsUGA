---
name: Images
description: Select, size, preview, and export the club's generated graphics.
order: 5
section: guides
---

# Images

`backstage graphics` renders the templates from `@devdogsuga/brand`. It
needs no env file and no credentials. It is part of the officer CLI, so it runs
from a [Backstage](https://github.com/DevDogsUGA/Backstage) clone (see [devtools](./devtools.md#what-lives-elsewhere)):

```bash nocheck
backstage graphics
```

Run it without arguments for searchable graphic, format, and output pickers.

Graphics use `group/name` selectors:

- `brand/club`
- `app/dogdays`
- `event/2026-09-08`

A trailing star selects a group (`event/*`), a bare group means the same thing,
and `*` selects everything. Formats are comma-separated; use `--all-formats`
for every size supported by the selected graphics.

```bash
backstage graphics 'event/2026-09-08' \
  --format gdgc-square,gdgc-wide \
  --out ~/images

backstage graphics 'app/*' --all-formats --dry-run
```

Files go flat into `--out`, or the current directory, as `<name>-<format>.png`.
`--dry-run` lists the files and what each size is for, and writes nothing.

Page cards (`page/*`) are gone: the platform renders them per request, and the
few images no route draws are written into `apps/platform/public` (in Backstage) by that app's
`codegen`. Nothing is written into the repository by hand any more, so there is
no `--default-out`.

Event graphics are backed by meetings rather than committed files. They read the
`@devdogsuga/events` package in Backstage (see
[Events](../../platform/infrastructure/events.md)) — no database, local or
hosted, is involved. A wildcard export warns and continues with static
graphics when events are unavailable; a specific `event/*` request fails
because it has nothing useful to render.

## QR codes

`backstage qr` makes the same codes as the console's QR page, with every
option the page has, and a few formats it does not:

```bash
backstage qr https://devdogsuga.org --theme devdogs-dark --format svg,png,webp
```

`--theme` sets logo, shape and ink in one go; `--logo`, `--color`,
`--gradient`, `--shape`, `--size`, `--error-level` and the rest override it. The
flags come from the same schema the page parses, so a new option reaches both,
and it prints the page's scannability warning. The console page stays but is
deprecated; new options are CLI-only.
