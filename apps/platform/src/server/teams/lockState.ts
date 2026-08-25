import type { SQL } from "drizzle-orm";
import { and, eq, isNotNull, inArray, lte, or, sql } from "drizzle-orm";
import { competitions, teams } from "~/server/db/schema";

/**
 * Whether a team's roster is closed, in one place.
 *
 * The predicate is read by the join checks, the team page, the officer
 * console, and the UI that decides whether to show a "close your PR to add
 * someone" hint. Four copies of a three-term boolean is exactly the drift that
 * produces a screen saying a roster is open while the action rejects the join,
 * so it lives here as one definition with a SQL spelling beside it.
 */

/** The inputs the predicate needs. Deliberately not a full row — callers
 *  assemble this from a join, and narrowing it keeps the dependency honest. */
export interface LockInputs {
  submissionState: "open" | "closed" | "merged" | null;
  lockedManuallyAt: Date | string | null;
  /** From the team's competition. Null means judging is not yet scheduled. */
  judgingStartsAt: Date | string | null;
}

export type LockReason = "entry" | "judging" | "officer";

function toTime(value: Date | string | null): number | null {
  if (value === null) return null;
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Why the roster is locked, or null if it is open.
 *
 * Ordered so the most actionable reason wins. A team whose PR is open before
 * judging can unlock itself by closing it; once judging has begun it cannot,
 * and the UI needs to say so rather than offering an affordance that no longer
 * works.
 */
export function lockReason(
  team: LockInputs,
  now: Date = new Date(),
): LockReason | null {
  const judgingAt = toTime(team.judgingStartsAt);
  if (judgingAt !== null && now.getTime() >= judgingAt) return "judging";
  if (team.lockedManuallyAt !== null) return "officer";
  // A merged entry is still an entry. Closing a PR reopens the roster; merging
  // one never does.
  if (team.submissionState === "open" || team.submissionState === "merged") {
    return "entry";
  }
  return null;
}

export function isLocked(team: LockInputs, now: Date = new Date()): boolean {
  return lockReason(team, now) !== null;
}

/**
 * Whether closing the PR would reopen the roster.
 *
 * This is the "we need one more person" affordance: close the PR, add them,
 * reopen. It is deliberately bounded — once judging begins, closing no longer
 * unlocks, so there is no path to adding a ringer at the table.
 */
export function canUnlockByClosingPr(
  team: LockInputs,
  now: Date = new Date(),
): boolean {
  return lockReason(team, now) === "entry" && team.submissionState === "open";
}

/**
 * The same predicate as SQL, for queries that must filter in the database.
 *
 * Requires `teams` joined to `competitions`. Kept adjacent to the TypeScript
 * version above so a change to one is visibly a change to the other.
 *
 * CURRENTLY UNCALLED, and worth knowing why before reaching for it or deleting
 * it. The one query that should use it — `freezeParticipation` in
 * `judgingPass.ts` — instead spells its own filter out, and that filter is NOT
 * this predicate: it omits `lockedManuallyAt`, so the freeze runs against a
 * manually locked roster. Whether that is a bug or the intended narrowing has
 * not been decided. Until it is, this is the honest state: two spellings of
 * "locked" that nothing forces to agree, and the adjacency above is doing no
 * work because only one of them has a caller.
 */
export function lockedSql(): SQL {
  return or(
    inArray(teams.submissionState, ["open", "merged"]),
    and(
      isNotNull(competitions.judgingStartsAt),
      lte(competitions.judgingStartsAt, sql`now()`),
    ),
    isNotNull(teams.lockedManuallyAt),
  )!;
}

/** Convenience for the common "this team, right now" lookup. */
export function teamLockFilter(teamId: string): SQL {
  return and(eq(teams.id, teamId), lockedSql())!;
}
