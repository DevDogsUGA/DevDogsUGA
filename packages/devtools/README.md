# @devdogsuga/devtools

## Release notes for next

`doctor` now checks Flutter in any product repository with `devtools.config.json`
and an exact `environment.flutter` version in its pubspec. A different local
version, including a newer one, prints a warning with the version to install.
Missing Flutter or unreadable version output also warns. The check does not
fail the command. The existing study-group-finder checks are unchanged.

Contributor CLI for a DevDogsUGA checkout: the real tools with the session's
tier filled in, a menu over them, and the checks CI runs.

```bash
pnpm devtools                           # no arguments: menu of interactive commands
pnpm devtools setup                     # prepare a checkout, then print the database next steps
pnpm devtools doctor                    # first stop: machine, tier, stack, types, buckets, seeded data
pnpm devtools supabase start            # boot Supabase on this machine
pnpm devtools jobs run                  # choose a background job (a cron sync or a Workflow) and run it
pnpm devtools jobs list                 # every job, its schedule, and schedules that never fire
pnpm devtools jobs serve                # keep an app-scoped Workflow runtime open
```

```bash
pnpm devtools supabase db push     # the real tool, with the tier's --db-url filled in
pnpm devtools wrangler|drizzle-kit|psql …
pnpm devtools apply-migrations     # db push, then asks about types:db
pnpm devtools restart-stack|new-migration|push-config
```

`cron` and `workflows` are aliases of `jobs` that narrow it to one kind:
`cron run` is `jobs run --kind sync` (quick syncs, the Worker cron routes) and
`workflows run` is `jobs run --kind long-running` (Cloudflare Workflows).

`supabase` adds `--db-url` or `--project-ref` from the session's tier unless you
passed `--local`, `--linked`, `--db-url` or `--project-ref` yourself. It never
falls back to the linked project and never adds `--yes`. Every run prints the
exact command afterwards.

Against `staging` or `production`, every command asks once before it runs
(`--yes` answers it). With no terminal, or `CI=true`, there is no menu and no
banner, the tier must be named (`--tier` or `DEPLOY_ENV`), confirmations need
`--yes`, and `--no-env` skips loading env files.

`pnpm devtools script` picks a package and then one of its scripts (or a script
and then a package that has it) and runs `pnpm -F <package> run <script>`;
`pnpm devtools script <package> <script>` skips the questions.

`--dry-run` prints what would run and runs nothing. A tool call prints as
`Would run: <command>`; a command that spawns or writes without a dry-run mode
of its own stops and prints its own command line. For the passthroughs and
`run`, the tool owns every flag after its name, so put ours first:
`pnpm devtools --dry-run supabase db push`.

When a run fails, devtools writes a log (`~/.local/state/devdogs/logs`, or
`DEVTOOLS_LOG_DIR`) with the command, versions, the tool commands that ran and
devtools' own output, secrets redacted, and prints its path and the Sentry
event id if telemetry sent one. Attach it to a #tech-support message.

`check migrations|env|workers|scripts` is what CI runs over the checkout (it
replaces DevDogsUGA's `packages/repo-checks`). They read the checkout and
nothing else: no tier, no env file. `pnpm devtools --help --json` prints every
command path (deprecated ones marked), for tools that check what a page shows.

The `db` and `cf` namespaces are gone: `supabase`, `wrangler`, `drizzle-kit`
and `psql` plus package scripts (`types:db`, `types:drizzle`, `types:cf`,
`preview`) replace them. The deprecated `run` alias is gone too (TASK-404):
`pnpm -r run <task>` runs a task in every package and `pnpm -F <app> <task>`
in one. The retired `db`, `cf`, `gen`, `emails`, `grant-root`, `preset` and
`run` names are refused with where they went (`preset apply-migrations` is now
`apply-migrations`, and so on). Inside a product repository (below) `db` is
the product's own command.

What always needs production secrets is not here. `deploy`, `env
pull|push|audit` and `planner` are in `@devdogsuga/backstage`
(`pnpm backstage …` from a Backstage clone; it is no longer published); `devtools
env` keeps `init`, `example` and `reset`, and `bw` is gone (backstage's `env`
signs in to Bitwarden itself). CI calls `backstage` directly.

The menu is generated from the same command tree the argv parser walks, so
there is no second list to fall out of step — reach for `--help` at any level
rather than a table here. Its first screen lists every interactive command
under a plain-English title ("Restart local Supabase") with the command to
type beside it (`restart-stack`).

## Which repo it runs in

Both CLIs run from a DevDogsUGA checkout or from Backstage's (`package.json`
name `devdogs-monorepo` or `backstage`; the layout code is
`packages/cli-core/src/repo/layout.ts`). From Backstage, DevDogsUGA is
`<root>/devdogsuga`: a gitignored symlink to the sibling clone locally
(`pnpm devdogsuga`), a real checkout at the pinned SHA in CI.

| What                                                                                                  | Where                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/` (CLI cwd, config, migrations, seeds, avatars, env manifest), `database.types.ts`, `docs/` | DevDogsUGA's root (`devdogsuga/` from Backstage)                                                                                                                                                                                   |
| `workers.json`, `.github/`                                                                            | the repo you are in; DevDogsUGA without one manages no Workers                                                                                                                                                                     |
| apps (`cron`, `run`, `deploy <app>`, env manifests)                                                   | the repo you are in plus DevDogsUGA's `apps/`; on a name clash the repo you are in wins                                                                                                                                            |
| `.env`, `.env.<tier>`, `.env.generated`                                                               | the root of the repo you are in; `deploy write-env` and the local stack's `.env.generated` also write DevDogsUGA's root, because schedule-builder reads its own repo root. `env pull\|push\|reset` touch only the root you are in. |

`pnpm exec supabase` and `wrangler` run inside DevDogsUGA's workspace, so
`devdogsuga/` needs its own `pnpm install` before the commands that use them.

## Product repositories

A repository with a `devtools.config.json` at its root is a **product** (DogDays, DogPack): devtools
reads the file and serves a smaller command set that needs no tiers, no env registry and no workspace.
Both products carry a `package.json` whose `devtools` script is a `pnpm dlx` run of the published CLI, so
inside a checkout:

```sh
pnpm devtools setup
```

Anywhere else, the one-off form is `pnpm dlx @devdogsuga/devtools@next setup`.

| Command                                  | What it does                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setup [--local \| --hosted]`            | Writes `.env` from `.env.example`; starts the Docker stack (or takes your own hosted project's URL, keys and session-pooler `DB_URL`); `db sync`; the types; then `oauth`.                                                                                                                                                 |
| `db sync [--rebuild] [--strict] [--yes]` | Makes your development database match `supabase/schemas/`: recreates what it lost, applies schema changes you pulled, warns about extras (`--strict` fails on them), refuses to alter what is defined differently. Never resets it; `--rebuild` is the explicit reset (local only) and registers sign in again afterwards. |
| `db types [--download] [--pack <file>]`  | Generates the TypeScript types or Dart models from your database, or downloads the ones CI built for your exact schema hash. `--pack` writes the release asset (CI).                                                                                                                                                       |
| `db hash`                                | Prints the schema hash that names the generated types.                                                                                                                                                                                                                                                                     |
| `dev-data [--member <email\|id>]`        | Runs the product's `devData.file` SQL, in one transaction, as the member who last signed in with DevDogs. Refuses the product's production project.                                                                                                                                                                        |
| `oauth`                                  | "Sign in with DevDogs" on your database (the same wizard as the platform's).                                                                                                                                                                                                                                               |
| `doctor`                                 | Docker, the pinned Supabase CLI, `.env`, the database, whether the types match the schema.                                                                                                                                                                                                                                 |
| `supabase <args>`                        | The Supabase CLI at the version the product pins.                                                                                                                                                                                                                                                                          |
| `check env-example`                      | CI: `.env.example` holds public values only (it ships in the app).                                                                                                                                                                                                                                                         |

How it works, in short:

- **Schemas, not migrations.** Contributors edit `supabase/schemas/*.sql`. `db sync` asks the Supabase CLI
  (`db schema declarative sync --no-apply`) to diff them against a git-ignored `supabase/migrations/` that
  records what this database has had applied, writes the difference as a new migration, and applies it
  (`migration up --local`, or `db push --db-url` for a hosted project). A change that drops a table or column
  needs `--yes`. It then regenerates the types (and leaves them alone when nothing changed and they are current).
  On a hosted project, a machine with no record (a second laptop, a deleted `supabase/migrations/`) first
  restores it from the project's own history table (`migration fetch --db-url`), so the diff is not taken
  against an empty database. The record belongs to one database (`.devtools/record.json` notes which, and which
  files it has applied): another target's record is set aside and that database's own history is fetched, and a
  migration written but never applied is pending, not applied; it is applied on the next sync, with the `--yes`
  question for drops.
- **What a member changed.** A column that looks renamed (missing here, an extra of the same type beside it) is
  refused, not recreated empty. A difference in privileges on something that exists is applied as a GRANT of what
  `supabase/schemas` grants and reported; privileges beyond that are not taken away. Functions are named with
  their argument types, and a missing overload is recreated beside the member's own.
- **Types are never committed.** `db types` writes them to the path in the config, which is git-ignored.
  The schema hash covers the sorted schema paths, their LF-normalised contents and the generator version (the
  pinned CLI, or supadart); CI uploads a `<product>-types-<hash>.tgz` asset to a rolling `generated-types`
  release, and `db types --download` fetches the one for your hash. No match: it says so and points at `setup`.
- **Two env files.** `.env` is public and read by the app (`flutter run --dart-define-from-file=.env`);
  `.env.tooling` is git-ignored and holds `DB_URL`, `SECRET_KEY`, the target (`local` or `hosted`) and the
  "Sign in with DevDogs" client id and secret (`OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET`, which
  `db sync --rebuild` registers again). Nothing is written to `.env.local` in a product repo. `setup` (both files) and
  `oauth` (the tooling file) check that they are git-ignored and add them to the repo's `.gitignore`
  when they are not (Flutter's default ignore file leaves them out).
- **The pinned CLI.** devtools finds `supabase` in `node_modules/.bin` or on PATH when its version is the
  pin, and otherwise runs `pnpm dlx supabase@<pin>` (`npx --yes supabase@<pin>` only when pnpm is not on PATH).
- **A hosted project** needs custom OAuth providers turned on and the app's return addresses allowed.
  `setup` does both through the Management API when `SUPABASE_ACCESS_TOKEN` is set, and prints the two
  dashboard steps when it is not.
- **No terminal.** `setup` takes `DEVTOOLS_SUPABASE_URL`, `DEVTOOLS_SUPABASE_PUBLISHABLE_KEY`,
  `DEVTOOLS_SUPABASE_SECRET_KEY` and `DEVTOOLS_DB_URL` for a hosted project, and registers sign in from
  `DEVDOGS_OAUTH_CLIENT_ID` / `DEVDOGS_OAUTH_CLIENT_SECRET` instead of opening a browser.

```jsonc
// devtools.config.json
{
  "product": "dogpack", // lowercase id; names the generated-types assets
  "name": "DogPack",
  "supabase": {
    "version": "2.117.0", // the CLI pin; part of the types hash
    "schemas": ["dogpack"], // schemas the generated types cover
    // "dir": "supabase"
  },
  "types": { "kind": "supadart", "out": "lib/generated" }, // or { "kind": "typescript", "out": "src/database.types.ts" }
  "generatedTypes": { "repo": "DevDogsUGA/DogPack" }, // where `db types --download` looks
  "oauth": { "redirectUris": ["dev.dogpack://login-callback"] },
  "devData": { "file": "supabase/dev-data.sql" }, // reads current_setting('devtools.member_id')
  "production": { "projects": ["dogpack", "<project ref>"] }, // BOTH the vanity name and the ref: a Postgres URL only ever carries the ref
  "runHint": "flutter run --dart-define-from-file=.env",
}
```

The code is in `src/product/`; `src/active.ts` picks the tree, and `src/launch.ts` switches to it before any
tier is resolved.

## Telemetry disclosure

This CLI reports its own crashes to Sentry (see `src/telemetry.ts`), on by
default, in both `pnpm devtools` and `devtools-ci`:

- **What**: uncaught errors only — a captured exception plus a `command` tag
  naming the subcommand that threw (e.g. `doctor`, `deploy platform`).
  Nothing about a successful run is ever sent.
- **When**: every run, unless `DEVTOOLS_TELEMETRY=0` is set (per-machine or
  per-job opt-out) — or the build has no DSN. The DSN is baked in when
  Backstage's `publish.yaml` builds the package, from the repo's
  `DEVTOOLS_SENTRY_DSN` Actions variable, so only published builds report;
  local builds and `pnpm pack` tarballs don't. Either condition means
  no `Sentry.init()` call happens: no network request, no console output.
- **What's scrubbed**: this CLI touches local `.env` files, so every event
  passes through
  `@devdogsuga/sdk/telemetry`'s shared scrubbers before it leaves the process —
  file paths reduced to basenames, email addresses redacted, and
  token/secret-shaped values stripped out of messages, breadcrumbs, and
  stack frames. See `packages/sdk/src/telemetry/scrub.ts` for exactly what each
  scrubber matches.

## Layout

`src/` is one folder per domain (kebab-case). A domain declares its commands in
`catalog.ts` (inert data) and owns its handlers in `commands.ts`; `src/catalog.ts`
composes the tree and `src/cli.ts` maps top-level command names to handlers. The
shared core (repo and peer loading, ui, telemetry, tier and env entry, the
catalog, help and menu) lives in the private `@devdogsuga/cli-core` package,
which `tsdown` inlines into `dist/`. Only that is bundled: every other
import stays external and must be declared in this package's `dependencies` or
`peerDependencies`, and the build fails when one is not
(`../../scripts/check-bundle-imports.mjs` reads the built output).

[Command guide](../../docs/toolkit/guides/devtools.md) ·
[API reference](https://devdogsuga.org/docs/toolkit/reference/api/devtools) ·
[Quickstart](../../docs/monorepo/guides/quickstart.md)
