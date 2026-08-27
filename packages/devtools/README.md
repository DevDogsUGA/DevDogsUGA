# @devdogsuga/devtools

Contributor CLI: database, moderation checks, and OAuth setup — plus env sync
and the deploy steps CI runs.

```bash
pnpm devtools                # no arguments: a menu covering every command
pnpm devtools link                 # boot the local stack, or --remote to link a project
pnpm devtools reset                # replay migrations, then seeds, then regenerate types
```

The menu is generated from the same command tree the argv parser walks, so
there is no second list to fall out of step — reach for `--help` at any level
rather than a table here.

[API reference](https://devdogsuga.org/docs/toolkit/reference/api/devtools) ·
[Quickstart](../../docs/monorepo/guides/quickstart.md)
