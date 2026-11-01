# archive

The last state of the platform's Teams and competitions tables, exported from
production once, before the tables were dropped (lane 3e of the platform
cleanup).

| File                      | From                                                |
| ------------------------- | --------------------------------------------------- |
| `competitions.json`       | `platform.competitions`                             |
| `competitionEntries.json` | `platform."competitionEntries"`, with team and slug |
| `teams.json`              | `platform.teams`, each with its `members`           |
| `manifest.json`           | row counts per table, redactions and file hashes    |

`manifest.json` records how many rows each of the five tables had in production
(`teams`, `teamMembers`, `teamMembershipRequests`, `competitions`,
`competitionEntries`). `teamMembers` live inside `teams.json`, and
`teamMembershipRequests` (transient invitations) are a count only.

This repository is public, so the files hold no more than the competition
archive page showed:

- `teams.joinCode` (a secret) and `teams.createdBy` are left out.
- A team member is named by public handle only when they had a public profile.
  Everyone else is a row with a null handle, so the counts still match.

The unredacted rows (`teams.json`, `teamMembers.json`,
`teamMembershipRequests.json`, `competitions.json`, `competitionEntries.json`)
were written outside the repository, for officers: on the machine that ran the
export, in `~/.devdogs-secrets/archive-2026-10/` (re-exported 2026-10-12, after production gained one team, one member and two membership requests, and again 2026-11-01, after two competitions closed and the GitHub sync refreshed their timestamps; each earlier export is superseded). That is
the only copy. An officer who wants it kept should move it to the officers'
shared drive before the machine is retired.

## Reproducing and checking

```bash
# Export again (reads production through the Management API: the read-only
# endpoint for every table but the members query, which needs the
# publicProfiles view and so uses the ordinary endpoint with a single bare
# SELECT, checked for write keywords before it is sent)
node scripts/archive-teams-and-competitions.ts

# Verify the files against the manifest, and both against production: row
# counts AND the rows themselves (a rename, a member's leftAt, a toggled
# acceptingRequests or a closed competition keep the counts equal and still
# fail). Add --private-out to check the unredacted copy as well. It prints
# which rows and fields differ, never their values.
node scripts/archive-teams-and-competitions.ts --check --private-out ~/.devdogs-secrets/archive-2026-10
```

Production keeps taking writes to these tables until the Teams code is gone
from production, so the archive goes stale until then. Before the drop
migration runs, run `--check` (with `--private-out`, so the only copy of the
join codes and user ids is checked too; `githubSyncedAt` is ignored, since the
reconcile moves it on every run); if it reports any difference, run the export
again (with `--private-out`), commit `archive/`, and only then apply the drop.
The drop must never run against an archive `--check` rejects.

Once the tables are dropped, `--check` verifies the files against the manifest
only. `apps/platform/src/lib/archive.test.ts` runs that part in CI.
