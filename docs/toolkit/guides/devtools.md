---
name: devtools
description: The contributor CLI, organized by the job you are trying to do.
order: 3
---

# devtools

`pnpm devtools` is the front door for repository tasks, local and hosted
infrastructure, generated content, configuration, and platform checks.

Run it without arguments to open the interactive menu. The menu reads the same
command registry as `--help` and shell completions, but leaves out commands that
only make sense in a shell pipeline. In particular, `completions` is CLI-only.

```bash
pnpm devtools                       # interactive menu
pnpm devtools --help                # command map
pnpm devtools db --help             # one level deeper
pnpm devtools db reset --help       # one command's options
```

## Start here

```bash
pnpm devtools setup
pnpm devtools db start
pnpm devtools oauth
pnpm devtools run dev
```

`setup` checks the machine and creates `.env` when it is missing. After the
local database starts, `oauth` configures "Sign in with DevDogs" for the
project. Both commands also live together under **Workspace** in the menu.

## Command groups

### Workspace

- `setup` — check prerequisites and initialize the workspace.
- `oauth` — configure the local Supabase project for DevDogs OAuth.
- `run` — run a Turborepo task after choosing the affected apps.
- `gen` — refresh committed generated source.
- `docs` — maintain the documentation search index.

### Runtime & infrastructure

- `db` — local containers, migration files, database endpoints, and hosted
  database infrastructure.
- `cf` — preview, type-generate, build, or invoke Wrangler for an app.
- `cron` — audit configured schedules or manually fire a route-backed job.
- `workflows` — list or trigger Cloudflare Workflows declared by Wrangler.

These commands are not restricted to local services. Their leaf help names the
target explicitly: this machine, a selected database endpoint, a local Wrangler
session, staging, or production.

### Content & communications

- `images` — render club, page, app, and event graphics.
- `emails` — render populated transactional-email previews.
- `newsletter` — export or deliver Changelog issues.

See [Images](/docs/toolkit/guides/images) and
[Transactional email](/docs/toolkit/guides/email) for selection and export
examples.

### Configuration & integrations

- `env` — synchronize target env files with Bitwarden, GitHub, and Cloudflare.
- `bw` — pass arguments through to the bundled Bitwarden CLI.
- `airtable` — check, verify, or apply the officers' base schema.

### Moderation

- `catalog` — list report reasons and moderatable content types.
- `doctor` — check an app's moderation integration.
- `roundtrip` — exercise report, quarantine, and freeze behavior end to end.
- `grant-root` — grant a local account the Root role.

All four moderation commands are structurally local: they discover the
Supabase stack on this machine and cannot be pointed at production.

## Cron jobs and Workflows

Both commands discover apps from `apps/*/wrangler.jsonc`; there is no app
allowlist to maintain.

`cron` reconciles each Wrangler tier's `triggers.crons` with the app's exported
`CRON_ROUTES` and `WORKFLOW_CRONS`. A job remains available for manual use when
a tier intentionally has an empty schedule, which is how staging avoids
duplicating production automation while still supporting rehearsals.

```bash
pnpm devtools cron list
pnpm devtools cron run
pnpm devtools cron run --app platform --cron '*/15 * * * *' --tier staging
```

With no selector, `cron run` asks for the tier and then shows the discovered
route jobs. Each choice says whether that tier schedules it automatically or
keeps it manual-only. Staging and production require confirmation;
noninteractive calls use `--yes`.

`workflows` reads each tier's `workflows` bindings directly from Wrangler.
Names, bindings, and implementation classes shown by the CLI are therefore the
ones that deploy.

```bash
pnpm devtools workflows list
pnpm devtools workflows run
pnpm devtools workflows run \
  --app schedule-builder \
  --workflow production-schedule-builder-scrape \
  --tier production --yes
```

Development triggers the selected local Wrangler session. Staging and
production invoke `wrangler workflows trigger` with the selected environment.
Use `--params '<json>'` for a parameterized Workflow and `--port` when the
local session is not on port 8787.

The local session must be `wrangler dev`, not `next dev`. `next dev` runs the
Next.js development server for the web UI; it does not register Cloudflare
Workflow bindings or expose Wrangler's local control API. Before triggering,
devtools probes that API. If Wrangler is absent, the interactive command offers
to build and start it for this one Workflow and stops it afterward, or lets you
enter the port of a Wrangler session that is already running. The Wrangler
configuration performs the same freshness check when `wrangler dev` is started
manually, so a clean checkout first generates its required `.open-next` output.
When devtools owns the session, it also passes only the selected app's declared
runtime variables through a temporary mode-0600 env file and removes that file
when Wrangler stops. It does not expose the rest of the contributor's shell
environment to the Worker.

To keep Wrangler running in a separate terminal, use the app-scoped server
command and pass the same port to the trigger:

```bash
pnpm devtools workflows serve --app schedule-builder --port 8787
pnpm devtools workflows run --app schedule-builder --tier development --port 8787
```

`pnpm --filter schedule-builder cf:dev` is the short form for the first
command. Bare `wrangler dev` does not read the repo-root `.env`; using it
directly still requires a populated app-local `.dev.vars` or an explicit
`--env-file`.
The devtools server is the supported path because it derives the correct key
set from the app's environment manifest without copying unrelated credentials.

For a temporary server started by `workflows run`, devtools follows the created
instance until it completes or errors before stopping Wrangler. A successful
Wrangler trigger only means the instance was queued, so it is not treated as a
successful Workflow run on its own.

## Interactive and scripted use

Interactive commands ask only for information they can discover at runtime.
Scripts should pass selectors explicitly and may request `--json` from list and
audit commands. Destructive or deployed writes require `--yes` when no terminal
is available.

The deployment pipeline uses the separate `devtools-ci` binary. CI-only deploy
steps never appear in the contributor menu.

See [Database commands](/docs/toolkit/guides/database) and
[Environment commands](/docs/toolkit/guides/env/commands) for the two largest
command families.
