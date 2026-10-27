# @devdogsuga/backstage

The officer and production CLI: everything that needs production secrets and is
used only by the two people who hold them (and CI), plus the tools that need
only the user's own login. It is **not published to npm**: run it from a
Backstage clone, where `pnpm install` links the bin to the root script.

```bash
git clone https://github.com/DevDogsUGA/Backstage && cd Backstage
pnpm install && pnpm -r --filter './packages/**' --if-present run build
pnpm backstage                                  # same as: node packages/backstage/bin/backstage.mjs
```

Rebuild (`pnpm -C packages/backstage build`) after pulling, since the bin runs
`dist/`. CI runs the same checkout's build, so local and CI runs match.

It **starts without a checkout**. Help, `version`, `completions`, the tools
below that need no secrets (`graphics`, `qr`, `github`, `newsletter`, `creds`),
`import`, `export` and
anything run with `--no-env` never look for one; a command that reads a checkout says
"run this from inside a DevDogsUGA clone" and exits 1. The DevDogsUGA libraries
it reads (`@devdogsuga/sdk/env`, `@devdogsuga/sdk/db`) are optional peers, resolved
through the checkout by the commands that need them.

```bash
pnpm backstage                                   # no arguments: a menu
pnpm backstage env pull --target production      # Bitwarden → .env.production
pnpm backstage env audit --target production     # every store, plus orphaned Worker secrets
pnpm backstage env audit --target production --prune
pnpm backstage deploy platform --tier staging    # token check, secrets file, wrangler deploy
pnpm backstage --no-env deploy write-env         # the CI steps that supply their own environment
pnpm backstage --no-env planner status           # the preflight credential, from DB_URL
pnpm backstage graphics 'event/*' --out ~/images # club images, no checkout
pnpm backstage qr https://devdogsuga.org --format svg,png,webp --logo acm
pnpm backstage newsletter send changelog 3.0.1 --to a@uga.edu   # asks first; --yes with no terminal
pnpm backstage creds                             # share a club login with officers, as a Bitwarden Send
pnpm backstage creds renew                       # extend every Send 30 days
pnpm backstage import involvement --file OrganizationRoster.csv  # verify members; previews, then asks
pnpm backstage import attendance --meeting 2026-09-09 --file sign-in.csv
pnpm backstage import contributions --dry-run     # merged PRs the webhook missed; previews, then asks
pnpm backstage export stars --from 2026-08-17   # audited under your gh login
pnpm backstage export attendance --meeting 2026-09-09 --format bevy,involvement
```

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

## Commands

| Command                                            | What it does                                                                           |
| -------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `deploy <app> --tier <t>`                          | Checks `CLOUDFLARE_API_TOKEN`, writes the Worker's secrets file, deploys, removes it.  |
| `deploy write-env`                                 | Composes `.env.<DEPLOY_ENV>` from the GitHub environment.                              |
| `deploy preflight`                                 | Classifies the project: paused (skip) or broken (fail).                                |
| `deploy plan`, `deploy migrate [--include-seed]`   | Dry-run the migrations (and new seed files) into the job summary; apply them.          |
| `deploy avatars`                                   | Uploads seeded headshots the bucket lacks; never replaces one (`SECRET_KEY`).          |
| `deploy smoke --tier <t> [--app]`                  | Public routes answer 200, the auth redirect works, this deploy's Sentry release shows. |
| `deploy reconcile --tier <t>`                      | The platform's config reconcile, after the deploy (`CRON_SECRET`).                     |
| `deploy prune-monitors --tier <t> [--app]`         | Deletes the app's Sentry Crons monitors it no longer declares (production only).       |
| `env pull\|push\|audit --target <t>`               | One env file per target, synced to Bitwarden and GitHub. `audit` lists orphans.        |
| `planner status\|create\|reset-password\|drop`     | The `migration_planner` role the preflight tier holds.                                 |
| `graphics [graphic…]`                              | Club images from `@devdogsuga/sdk/brand`: `brand/*`, `app/*`, `event/*`.               |
| `qr <text>`                                        | QR codes with every option of `/console/qr`.                                           |
| `github rulesets\|settings`                        | Diff (and with `--apply` write) GitHub config, through `gh`.                           |
| `newsletter render\|draft\|send <series> <issue…>` | Changelog or GDGC issues as files, mailbox drafts, or a send.                          |
| `creds send\|add\|renew\|list\|report`             | Club logins from Bitwarden as email-verified Sends, and the Linear report.             |
| `import involvement --file <csv>`                  | Verifies the members on the Involvement Network roster, unverifies everyone else.      |
| `import attendance --meeting <day> --file <csv>`   | Records a meeting's attendance from a sign-in sheet (method `import`).                 |
| `import contributions [--repo] [--since]`          | Backfills merged pull requests from the organization's repositories (GitHub App).      |
| `export stars\|attendance\|reflections\|responses` | Member data as CSV, each export audited under the officer's gh login.                  |

`smoke` and `reconcile` replace DevDogsUGA's `packages/deploy-checks`. The
per-app data (hosts, public paths, the protected path and its redirect) stays in
DevDogsUGA, as a `smoke` field on each app's entry in `workers.json`:

```json
[
  {
    "path": "apps/platform",
    "smoke": {
      "hosts": {
        "staging": "staging.devdogsuga.org",
        "production": "devdogsuga.org"
      },
      "publicPaths": ["/", "/events"],
      "protectedPath": "/console/permissions",
      "protectedRedirectPrefix": "/auth"
    }
  }
]
```

Entries may be bare paths or objects. While the field is absent, the table
`deploy-checks` carried answers for `platform` and `schedule-builder`.

## The tools that need no production secrets

None of these reads an env file or needs a checkout, so the launcher skips env
entry for them (`envFree` in the command tree).

- **`graphics`** renders the brand, app and event images with
  `@devdogsuga/sdk/brand/render`, reading meetings from the published
  `@devdogsuga/events`. Files go to `--out` or the current directory, flat, as
  `<name>-<format>.png`. There is no `page/*` group (the platform renders page
  cards per request) and no `--default-out`.
- **`qr`** takes its options from `qrRequestSchema` in `@devdogsuga/sdk/brand/qr`,
  the same schema `/console/qr` parses, so a new option reaches both. Every
  schema field has a flag (`qr/options.ts` is typed over the schema, and a test
  checks it): content, `--size`, `--margin`, `--color`, `--background`,
  `--gradient`, `--shape`, `--error-level`, `--qr-version`, `--logo` (a preset,
  `none`, or an image file) with `--logo-size`, `--logo-padding` and
  `--logo-crop x,y,w,h`, and `--format` with any of svg, png, jpg, webp, avif
  and tiff at once. It prints the same scannability warning as the page.
  `/console/qr` stays, deprecated; new options are CLI-only.
- **`github rulesets|settings`** keep GitHub's rulesets and repository settings
  as code, through `gh` and your own login. They must keep matching what the
  platform assumes. The retired `team/**` ruleset is deleted by `github rulesets
--apply` (after `~ALL` is widened to cover `team/*`). The `team/<slug>`
  per-team rulesets and `team-*` GitHub teams left over from the removed Teams
  feature are not managed here; delete them by hand (see the lane 3e notes).
- **`newsletter render|draft|send`** are described in the
  [newsletter package](../newsletter/README.md). Drafts and sends use the club
  mailbox (`devdogs@uga.edu`) with the officer's own Microsoft sign-in; there
  is no `--mailbox`. `send` needs `--to` and always asks first, naming the issue
  and every recipient; with no terminal, `--yes` answers it. The sign-in
  borrows Thunderbird's public client ID (see `src/newsletter/oauth.ts`); if
  Microsoft or UGA's tenant blocks it, sending needs a club-owned app
  registration.

## Shared logins: `creds`

The club's shared logins (Instagram, Canva, ArchPass, Linktree, later project
API keys) live in the DevDogs Bitwarden organization, in whatever collection
suits them. `creds` hands any login or secure note there to officers as a
Bitwarden Send. Personal items, other organizations' items and production
secrets (which are in Secrets Manager, not the vault) are out of its reach.

- **`send`** picks items and recipients (officers by name or by role, read live
  from production: everyone holding a role other than `Member`, by UGA MyID
  email), shows a preview with the password masked as `••••••••`, then creates
  or updates **one Send per item**, restricted by email verification to its
  recipients and deleted 30 days out. Removing an address revokes it. Addresses
  off the roster need `--allow-email`. Non-interactive: `--item`, `--to`,
  `--role`, `--yes`.
- **`add`** saves a new login to the organization, then sends it. It goes in
  the one collection you can see, or the one you pick (`--collection` with no
  terminal). The password is typed at a hidden prompt, or read with
  `--password-stdin`; never argv.
- **`renew`** pushes each Send's deletion 30 days out in place (the link stays)
  and re-syncs its recipients and body from the item. It asks first for any Send
  with more than 7 days left.
- **`list`** prints items, recipients and expiry (`--json` for scripts).
- **`report`** regenerates the **Shared Accounts** Linear document (Platform &
  DevOps initiative), which `send`, `add` and `renew` also do. It lists only
  items that have been shared, and is generated whole; edits there are
  overwritten.

Each item's custom fields are the only access record: `Recipients`, `Owner`,
`Send ID`, `Send link`, `Send expires`, `Send account`. Sends belong to the
Bitwarden account that creates them, so `creds` runs on your own `bw` session
(signing in and unlocking after asking, or `BW_SESSION`), never on CI; renewing
a Send another officer made creates a new one, with a new link, under yours.

The roster needs production's `DB_URL`: `--db-url`, else `.env.production` in a
checkout, else Secrets Manager. The Linear key: `--linear-token`, then
`LINEAR_API_KEY`, then the item "DevDogs Linear API key (backstage)" in your
personal vault, then a prompt, which offers to save it there. Use your own key,
never one shared through the DevDogs organization: Linear records every edit
under the key's owner, and creds ignores organization items of that name.

## Member data: `import` and `export`

These replace the platform's `/console/verification` upload and
`/console/exports` downloads. They read and write production only:
`DB_URL`, `API_URL` and `SECRET_KEY` come from `.env.production` in a checkout,
else Secrets Manager. There is no `--db-url`, since a database override would
leave account creation pointed at production. Days (`--meeting 2026-09-09`,
`--from`, `--to`) are Eastern, and `--to` includes the whole day.

### `import involvement`

Replaces the platform's `/console/verification` upload. Export the roster from
the UGA Involvement Network (Roster → Export → Organization Roster) and pass the
file as it downloads: the title lines above the header, the `(Hidden)` columns
and the one-row-per-position layout are all expected. A roster for another
organization is refused.

The roster is the whole truth: everyone on it is verified, and everyone
verified who is not on it loses that status. A roster email finds its account
by the profile's UGA email first, then the sign-in address; with no account,
one is created (confirmed, no invite email) so the member is verified the first
time they sign in. Every run previews the counts, who is newly verified, who
loses verification, and whose preferred name differs from the roster, then
asks; `--dry-run` stops there, `--yes` answers with no terminal. Preferred
names are never changed. Rerunning the same export changes nothing.

### `import attendance`

Records a meeting's attendance from a sign-in sheet, for members who could not
check in on the platform. The sheet is a Google or Microsoft Forms response
export or a hand-made spreadsheet, saved as CSV; one sheet is one meeting,
named with `--meeting` (its day, slug or id; a day with two meetings
asks for the slug). The header and columns are found, not assumed: the email
column is the one holding UGA addresses, the name is "First/Last Name" or a
column mentioning "name", and `--email-column`/`--name-column` override
either. A sheet with no header is read as every address in it. Only UGA
addresses count; anything else is listed and skipped.

Check-ins are written with method `import`, stamped with the meeting's start,
and count for stars like any other. A member's own check-in is never touched.
Someone with no account gets one (confirmed, no invite), named from the sheet;
with no name on the sheet they are listed and skipped. Cancelled and future
meetings are refused. Rerunning a sheet records nothing new; `--replace`
makes the sheet the meeting's whole imported set, removing earlier imported
rows it no longer lists. Every run previews, then asks (`--dry-run`, `--yes`).

### `import contributions`

Backfills `platform.contributions` with the merged pull requests the webhook
never saw (everything before it was switched on, or while it was down). It
signs in as the read-only GitHub App (`GH_APP_ID`, `GH_APP_PRIVATE_KEY`, read
from `.env.production` or Secrets Manager like `DB_URL`), lists every
repository the installation sees, and reads each one's closed pull requests,
keeping the merged, human-authored ones (bots are skipped). `--repo
owner/name` and `--since 2026-09-01` narrow it. The preview says how many are
already recorded, how many are new and match a member by linked GitHub
account, and how many wait for their author to link GitHub; then it asks
(`--dry-run`, `--yes`). Authors are matched by GitHub user id, never by login,
and rerunning records nothing twice.

### `export stars|attendance|reflections|responses`

The platform's three CSVs, columns unchanged: `stars` (one row per earned
star), `attendance` (one row per check-in; `--meeting` for one night) and
`reflections` (each member's current text). `responses` is the check-in
survey: one row per answer, worded with each question's current labels
beside the stored value. With `--meeting` it is that meeting's answers plus
its attendees' member answers as they stood when it ended (from the answer
history); `--format wide` writes one meeting as one row per person and one
column per question. Each export writes a
`platform.exportAudit` row before reading anything, attributed to the
platform account linked to the GitHub login `gh` is signed in as, and refuses
to run when there is none.

`attendance` can also be written as a Bevy attendee import (GDG's
gdg.community.dev; one row per person, checked in, with a `survey:` column
for each question mapped to one in `questions.json` that anyone answered) and
an Involvement Network
list (one MyID email per line), both for one `--meeting`. `--format
platform,bevy,involvement` picks any of them, written from one read with an
audit row each; at a terminal it is asked. At a terminal each file's
destination is asked for too, with path completion (Tab completes the
highlighted suggestion; a folder means the suggested name inside it).
Otherwise files go to `./<kind>…[-<format>].<ext>`, or `--out` (a file, a
folder for several, or `-` for stdout). Files are owner-readable only and
never replace an existing file without `--yes` or a yes at the prompt.

No secret value reaches stdout, stderr, the failure log, Sentry, an error
message or argv: values go to `bw` as base64 JSON on stdin, every error is
scrubbed of every value read so far (`src/creds/secrets.ts`), and the clipboard
only ever gets the link. `src/creds/commands.test.ts` runs every path against a
fake `bw` with a sentinel password and looks for it in all of those places.

## Tiers, `--no-env`, CI

Nothing is ever asked at launch. `--tier <t>` (anywhere in argv) or
`DEPLOY_ENV` names the session's tier and so the env file loaded; with neither
the session is plain development (where `BWS_ACCESS_TOKEN` lives). `deploy`
refuses to run without one of the two.

`--no-env` loads no env files and does not look for a checkout: the caller's
environment is the environment. It is for `deploy write-env`, which creates the
file tier resolution would otherwise insist on reading, and for CI steps that
hold one narrow credential in the job's `env:` block.

With no terminal, or `CI=true`: no menu, no banner, plain lines, errors on
stderr, and every confirmation needs `--yes`. Against staging or production a
command that is not read-only asks once first (`--yes` answers it).

Each command checks for the secrets it uses up front: `deploy <app>` for
`CLOUDFLARE_API_TOKEN`, `deploy reconcile` for `CRON_SECRET`, `deploy
prune-monitors` for `SENTRY_MONITORS_TOKEN` (skipped without it), `env` for the
Secrets Manager token (flag, environment, then your personal Bitwarden vault,
which `env` signs in to and unlocks itself, then asking). The token is each
person's own: the vault read skips organization items, and a save sets no
organization, so one person's token can be revoked without the rest.

## Layout

Like devtools: `src/<domain>/catalog.ts` (inert data) and `commands.ts`;
`src/catalog.ts` composes the tree, `src/cli.ts` maps names to handlers,
`src/launch-core.ts` settles the tier before any command is imported. The
shared core is the private `@devdogsuga/cli-core`, which `tsdown` inlines; every
other import must be declared here, and the build fails when one is not.

`env.ts` is the operator manifest (`BWS_ACCESS_TOKEN`, `CLOUDFLARE_API_TOKEN`
and friends). It is a copy of devtools' own, kept identical by a test, because
each CLI loads the one beside it.

Contract tests (`pnpm test:contract`) pack the real tarball, install it with
install scripts off outside any repo (and check the Bitwarden native module
loads), and run it again inside the fixture repo. They gate publishing.

Crash reporting is the same as devtools' (Sentry, scrubbed, off with
`DEVTOOLS_TELEMETRY=0`); the release is named `backstage@<version>`.
