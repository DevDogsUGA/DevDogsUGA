# supabase/

The database: `config.toml`, the seeds, and the schema in two forms.

- `migrations/` is the history, and the **baseline** of the declarative
  conversion: migrations 00 to 54, in timestamp order. Production has every one
  of them applied. Nothing in here changes for the conversion. After them come
  hand-written migrations, which exist for changes a generated diff must not
  make on its own (a destructive one goes through the destructive gate); today
  that is `20261012000000_drop_teams_and_competitions.sql`.
- `schemas/` is the declarative schema tree, one file per object, generated from
  production (`supabase db schema declarative generate --db-url <planner URL>
--strict-coverage --overwrite`, with the read-only `migration_planner`
  credential) and checked against the baseline.

## The invariant

Applying `migrations/` to an empty database and applying `schemas/` to an empty
database give the same schema:

```bash
pnpm exec supabase db schema declarative sync --no-apply --strict-coverage
# ... No schema changes found
```

`sync` writes a migration file when they differ (delete it if you were only
checking). `--strict-coverage` fails when the bundled pg-delta finds objects it
cannot manage, instead of leaving them out; the conversion's report is clean.
The tool needs Docker: it builds its shadow databases from the Supabase
Postgres image. The `[experimental.pgdelta]` section of `config.toml` switches
the commands on.

## What was edited by hand after the export

The CLI pinned here (2.117.0) exports two things that do not round-trip, and the
tree carries the fix so that the invariant holds:

- **Views.** `platform.memberStars` and `platform.publicProfiles` are server-only
  (`service_role` and `postgres` only). The export grants those two roles and
  says nothing about `anon` and `authenticated`, which a database that loads
  `default_privileges.sql` first gives them. Each file now starts its ACL with
  `REVOKE ALL ON TABLE ... FROM "anon", "authenticated"`.
- **Column privileges.** `platform.profile` grants `UPDATE` on single
  columns. The export writes the column grants first and
  then `REVOKE ALL ON TABLE ... FROM <role>`, and PostgreSQL's table-level
  `REVOKE` also revokes the role's column privileges, so the column grants were
  lost. The table-level statements now come first.

A fresh `generate --overwrite` reproduces both problems; reapply those two fixes
(or move to a CLI that exports them correctly) and rerun `sync` before
committing.

## Not committed

`packages/supabase/src/database.types.ts` is generated from the migrations
(`pnpm --filter @devdogsuga/supabase run codegen`); see
`packages/supabase/scripts/codegen.ts`.
