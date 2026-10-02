---
name: devtools
description: The contributor CLI — the real tools with your session's tier filled in, a menu over them, and the checks CI runs.
order: 3
section: guides
---

# devtools

`pnpm devtools` is the front door for contributor tasks: starting the local
stack, running the real tools against the right database, and the checks CI
runs. It is a visual layer over those tools, not a reimplementation of them —
the passthroughs hand your arguments to `supabase`, `wrangler`, `drizzle-kit`
and `psql`, and a menu builds the same commands for you.
`@devdogsuga/devtools` ships as a published package from the sibling
**Backstage** repository. The root `devtools` script runs it through `dlx` at
the latest version, so there is nothing to install and no version to bump.

Run it without arguments to open the interactive menu. Its first screen lists
every interactive command in plain English ("Restart local Supabase"), with the
command to type shown beside the highlighted one (`restart-stack`). The menu
reads the same command registry as `--help` and shell completions, but leaves
out commands that only make sense in a shell pipeline. In particular, `check`
and `completions` are CLI-only.

```bash
pnpm devtools                       # interactive menu
pnpm devtools --help                # command map
pnpm devtools jobs --help           # one level deeper
pnpm devtools jobs run --help       # one command's options
```

After a run that went through the menu (or filled a missing flag from a
prompt), the CLI prints the exact command it ran under **Run it directly next
time**, so you can learn a command by walking the menu once and paste the
printed line afterwards. `--dry-run` prints what would run and runs nothing;
for the passthroughs put it before the tool name
(`pnpm devtools --dry-run supabase db push`).

When a run fails, devtools writes a log with the command, versions and its own
output, secrets redacted, and prints the path. Attach it to a #tech-support
message.

## Start here

```bash
pnpm devtools setup
pnpm devtools supabase start
pnpm devtools doctor
```

`setup` checks the machine, creates `.env` when it is missing, and prints the
local database next steps in order: start Supabase, build the database from the
migrations, regenerate the types, create the storage buckets, `oauth`, then the
dev server for the app you picked. Every step is the real tool or a package
script, so each can be re-run alone. [Running the database](/docs/toolkit/guides/devtools-db)
covers that half.

## Command groups

### Workspace

- `setup` — check prerequisites and seed `.env`.
- `doctor` — check this machine against what the repo needs: Node, pnpm, Docker,
  `.env`, the stack, types, buckets, seeded data. Read-only. Scope it to one app
  with `--app <slug>`; pass `--report` for a redacted, paste-able block
  (versions, OS, results — no secrets) to drop in Discord when asking for help.
- `oauth` — configure "Sign in with DevDogs" for the local project.
- `script` — pick a package, then one of its scripts, and run it. With both
  named, `pnpm devtools script <package> <script>` skips the questions.

For one task, run the script itself: `pnpm -F <app> <task>` from the root, or
`cd apps/<app> && pnpm <task>`, and `pnpm -r run <task>` for every package. The
`run` command is a deprecated alias for the same thing.

### The real tools

- `supabase`, `wrangler`, `drizzle-kit`, `psql` — the tool itself, with the
  session's env.

`supabase` adds `--db-url` or `--project-ref` from the session's tier unless you
pass `--local`, `--linked`, `--db-url` or `--project-ref` yourself. It never
falls back to the linked project and never adds `--yes`. Against staging or
production every command asks once before it runs.

### Supabase

Common jobs that take a few tool calls in a row:

- `restart-stack` — stop and start the local stack, which is how a changed
  `config.toml` lands.
- `new-migration` — create an empty migration for an app's schema.
- `apply-migrations` — push new migrations to the session's database, then ask
  about `types:db`.
- `push-config` — show the diff, then push `config.toml` to the session's
  hosted project.

These were `preset <name>`; the old spelling is refused with the new one.

### Background jobs

- `jobs` — run, list or serve the apps' background jobs: quick syncs (cron
  routes) and long-running jobs (Cloudflare Workflows). See
  [Running background jobs](#running-background-jobs) below.

### Configuration and access

- `env` — `init`, `example` and `reset` for the local env files. Syncing them
  with Bitwarden and GitHub is `backstage env`; see [Env](/docs/toolkit/guides/env/commands).
- `roles` — see who holds each role, and grant or revoke one:

  ```bash
  pnpm devtools roles list
  pnpm devtools roles grant <email> President
  pnpm devtools roles revoke <email> President
  ```

  It works on any tier, including staging and production, where it asks first
  (`--yes` answers it).

### Checks

`check migrations|env|workers|scripts` are what CI runs over the checkout:
migrations are timestamped after the base branch's, every env variable is
declared, `workers.json` agrees with `wrangler.jsonc` and `deploy-app.yaml`, and
package scripts use the shared vocabulary. They read the checkout and nothing
else — no tier, no env file.

```bash
pnpm devtools check migrations
pnpm devtools check scripts
```

### What lives elsewhere

Anything that always needs production secrets, or only your own login, is in
`@devdogsuga/backstage`: deploys, `env pull|push|audit`, GitHub rulesets, the
newsletter, club images and QR codes. Inside this repo it is `pnpm backstage …`;
see [Images](/docs/toolkit/guides/images) and [Environment commands](/docs/toolkit/guides/env/commands).
Package scripts own the rest: `types:db`, `types:drizzle`, `types:cf`,
`fetch:campus-map` and `preview`.

## Running background jobs

`jobs` covers both kinds of background work an app runs on Cloudflare, and
discovers them from `apps/*/wrangler.jsonc`; there is no app allowlist to
maintain.

- **Quick syncs** are Worker cron triggers that call a route from the app's
  `CRON_ROUTES`. Each finishes in seconds.
- **Long-running jobs** are Cloudflare Workflows: multi-step work that retries
  and resumes where it stopped. Names, bindings and classes come straight from
  each tier's `workflows` bindings, so they are the ones that deploy.

```bash
pnpm devtools jobs list
pnpm devtools jobs run
pnpm devtools jobs run --app platform --cron '*/15 * * * *' --tier staging
pnpm devtools jobs run \
  --app schedule-builder \
  --workflow SCRAPE_WORKFLOW \
  --tier production --yes
```

`jobs list` reconciles each Wrangler tier's `triggers.crons` and Workflow
`schedules` with the app's `CRON_ROUTES` and `WORKFLOW_CRONS`, and flags a
schedule that never fires or fires nothing. A job stays available for manual
use when a tier intentionally has an empty schedule, which is how staging
avoids duplicating production automation while still supporting rehearsals.

With no `--cron` or `--workflow`, `jobs run` shows one picker with the two kinds
under their own headings, then asks for the tier. Each sync says whether that
tier schedules it automatically or keeps it manual-only. Staging and production
require confirmation; noninteractive calls use `--yes`.

`cron` and `workflows` still work as aliases that narrow `jobs` to one kind:
`cron run` offers only quick syncs and `workflows run` only long-running jobs
(`--kind sync` and `--kind long-running` say the same with `jobs`).

A Workflow on development triggers the local Wrangler session. Staging and
production invoke `wrangler workflows trigger` with the selected environment.
Use `--params '<json>'` for a parameterized Workflow and `--port` when the
local session is not on port 8787.

The local session must be `wrangler dev`, not `next dev`. `next dev` runs the
Next.js development server for the web UI; it does not register Cloudflare
Workflow bindings or expose Wrangler's local control API. Before triggering,
devtools probes that API. If Wrangler is absent, the interactive command offers
to build and start it for this one Workflow and stops it afterward, or lets you
enter the port of a Wrangler session that is already running. A bare
`wrangler dev` auto-redirects to the config `vinext build` writes at
`dist/server/wrangler.json`, so a clean checkout still needs that build run
once before `wrangler dev` has anything to redirect to.
When devtools owns the session, it also passes only the selected app's declared
runtime variables through a temporary mode-0600 env file and removes that file
when Wrangler stops. It does not expose the rest of the contributor's shell
environment to the Worker.

To keep Wrangler running in a separate terminal, use the app-scoped server
command and pass the same port to the trigger:

```bash
pnpm devtools jobs serve --app schedule-builder --port 8787
pnpm devtools jobs run --app schedule-builder --tier development --port 8787
```

Bare `wrangler dev` does not read the repo-root `.env`; using it
directly still requires a populated app-local `.dev.vars` or an explicit
`--env-file`.
The devtools server is the supported path because it derives the correct key
set from the app's environment manifest without copying unrelated credentials.

For a temporary server started by `jobs run`, devtools follows the created
instance until it completes or errors before stopping Wrangler. A successful
Wrangler trigger only means the instance was queued, so it is not treated as a
successful Workflow run on its own.

## Interactive and scripted use

Interactive commands ask only for information they can discover at runtime.
Pass selectors explicitly in scripts. With no terminal, or `CI=true`, there is
no menu and no banner, the tier must be named (`--tier` or `DEPLOY_ENV`), and
every confirmation needs `--yes`. `--no-env` skips loading env files, for a job
that supplies its own.

The deployment pipeline uses `pnpm backstage`, not devtools, so CI-only deploy
steps never appear in the contributor menu.

See [Running the database](/docs/toolkit/guides/devtools-db) and
[Environment commands](/docs/toolkit/guides/env/commands) for the two largest
command families.
