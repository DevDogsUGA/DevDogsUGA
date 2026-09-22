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

## Telemetry disclosure

This CLI reports its own crashes to Sentry (see `src/telemetry.ts`), on by
default, in both `pnpm devtools` and `devtools-ci`:

- **What**: uncaught errors only — a captured exception plus a `command` tag
  naming the subcommand that threw (e.g. `db reset`, `deploy platform`).
  Nothing about a successful run is ever sent.
- **When**: every run, unless `DEVTOOLS_TELEMETRY=0` is set (per-machine or
  per-job opt-out) — or `DEVTOOLS_SENTRY_DSN` is unset, which is the state of
  local development until an operator configures one and the state of every
  environment until the devtools Sentry project exists at all (see the
  committed placeholder in `src/telemetry.ts`). Either condition means no
  `Sentry.init()` call happens: no network request, no console output.
- **What's scrubbed**: this CLI touches newsletter recipient addresses and
  local `.env` files, so every event passes through
  `@devdogsuga/telemetry`'s shared scrubbers before it leaves the process —
  file paths reduced to basenames, email addresses redacted, and
  token/secret-shaped values stripped out of messages, breadcrumbs, and
  stack frames. See `packages/telemetry/src/scrub.ts` for exactly what each
  scrubber matches.

[Command guide](../../docs/toolkit/guides/devtools.md) ·
[API reference](https://devdogsuga.org/docs/toolkit/reference/api/devtools) ·
[Quickstart](../../docs/monorepo/guides/quickstart.md)
