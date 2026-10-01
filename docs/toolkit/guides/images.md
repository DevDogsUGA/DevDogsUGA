---
name: Images
description: Select, size, preview, and export the club's generated graphics.
order: 5
section: guides
---

# Images

`pnpm devtools images` renders the templates from `@devdogsuga/brand`.
Run it without arguments for searchable graphic, format, and output pickers.

Graphics use `group/name` selectors:

- `brand/club`
- `page/events`
- `app/dogdays`
- `event/2026-09-08`

A trailing star selects a group (`page/*`), a bare group means the same thing,
and `*` selects everything. Formats are comma-separated; use `--all-formats`
for every size supported by the selected graphics.

```bash
pnpm devtools images 'event/2026-09-08' \
  --format gdgc-square,gdgc-wide \
  --out ~/images

pnpm devtools images 'page/*' --all-formats --dry-run
```

`--default-out` writes committed graphics to their repository destinations.
Event exports go to the gitignored `.images/` directory instead. `--dry-run`
prints destinations and writes nothing.

Event graphics are backed by meetings rather than committed files. They read
`@devdogsuga/events` directly (see
[Events](/docs/platform/infrastructure/events)) — no database, local or
hosted, is involved. A wildcard export warns and continues with static
graphics when events are unavailable; a specific `event/*` request fails
because it has nothing useful to render.
