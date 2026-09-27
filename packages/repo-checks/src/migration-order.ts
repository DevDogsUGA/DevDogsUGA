/**
 * CI's guard for `supabase/migrations/`, one flat directory with no
 * per-schema subfolders (`platform` | `schedule_builder` | `study_group_finder`
 * all interleave there by filename alone). A file's timestamp prefix is the
 * only thing that orders it against every other migration, on every
 * developer's machine and in Supabase's own migration table, so a new file
 * timestamped BEFORE the newest one already on `main` sorts into the past:
 * anyone who reruns migrations from scratch after merging applies it out of
 * the order its author tested it in, and CI's own "migrations apply cleanly
 * from scratch" job (see `.github/workflows/ci.yaml`'s `database` job) never
 * catches it, because a single fresh runner applies every file in one pass
 * regardless of what merged when.
 *
 * The rule this enforces (see `docs/` contributing guidance for the
 * contributor-facing version): before merging a migration, recreate it with a
 * fresh timestamp if `main` has picked up a newer one since. This module is
 * the part of that rule a computer can check — it has no opinion on the
 * schema tag or description in the filename, only the leading digits.
 */

/** The leading run of digits a migration filename starts with, or null for a
 * name that does not start with one (nothing in `supabase/migrations/` should
 * fail to match this in practice; a filename that does is not this check's
 * problem to diagnose, so it is skipped rather than thrown on). */
export function migrationTimestamp(filename: string): string | null {
  const match = /^(\d+)_/.exec(filename);
  return match ? (match[1] ?? null) : null;
}

/** The newest timestamp among a set of migration filenames, or null for an
 * empty set — the state `main` was in before its first migration ever
 * landed, which cannot make anything "older" than it. */
export function latestMigrationTimestamp(
  filenames: readonly string[],
): string | null {
  let latest: string | null = null;
  for (const filename of filenames) {
    const ts = migrationTimestamp(filename);
    if (ts === null) continue;
    if (latest === null || ts > latest) latest = ts;
  }
  return latest;
}

export interface MigrationOrderViolation {
  filename: string;
  timestamp: string;
}

/**
 * Which of the newly added migration filenames sort before `baseLatest` —
 * the newest timestamp already on the base branch, from
 * `latestMigrationTimestamp` over the base branch's own file list. Timestamps
 * compare as strings rather than numbers on purpose: they are fixed-width
 * (`YYYYMMDDHHMMSS`), so lexicographic order and numeric order agree, and a
 * string compare never has to worry about a leading zero or a value too large
 * for a safe integer.
 *
 * A file whose name does not start with a timestamp is skipped, not flagged —
 * this check only orders what it can read a timestamp from.
 */
export function findOutOfOrderMigrations(
  addedFilenames: readonly string[],
  baseLatest: string | null,
): MigrationOrderViolation[] {
  if (baseLatest === null) return [];

  const violations: MigrationOrderViolation[] = [];
  for (const filename of addedFilenames) {
    const timestamp = migrationTimestamp(filename);
    if (timestamp === null) continue;
    if (timestamp < baseLatest) violations.push({ filename, timestamp });
  }
  return violations;
}
