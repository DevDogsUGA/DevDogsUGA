# @devdogsuga/devtools

Contributor CLI for workspace tasks, runtime infrastructure, generated
content, configuration, and moderation checks.

```bash
pnpm devtools                      # no arguments: menu of interactive commands
pnpm devtools db start             # boot Supabase on this machine
pnpm devtools db connect <ref>     # or register a hosted project as the remote target
pnpm devtools db reset             # replay migrations, then seeds, then regenerate types
pnpm devtools cron run             # choose a configured route cron
pnpm devtools workflows run        # choose a configured Cloudflare Workflow
pnpm devtools workflows serve      # keep an app-scoped Wrangler runtime open
```

The menu is generated from the same command tree the argv parser walks, so
there is no second list to fall out of step — reach for `--help` at any level
rather than a table here.

[Command guide](../../docs/toolkit/guides/devtools.md) ·
[API reference](https://devdogsuga.org/docs/toolkit/reference/api/devtools) ·
[Quickstart](../../docs/monorepo/guides/quickstart.md)
