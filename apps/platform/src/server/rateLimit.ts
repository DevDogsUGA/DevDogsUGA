import { sql } from "drizzle-orm";
import { db } from "~/server/db";

/**
 * The generalized form of `attendance/rateLimit.ts`'s limiter.
 *
 * `allowAttendanceAttempt` there is backed by a Workers Rate Limiting
 * binding, which is the right tool for its job -- a sub-minute burst limit
 * on rotating-code guesses, checked with no round trip to Postgres. But the
 * binding's `simple` mode only accepts a `period` of 10 or 60 seconds; it
 * cannot express "20 per hour" or "50 per day", which is what
 * `server/actions/teams.ts` needs for its GitHub-calling and email-sending
 * actions. This module is that generalized budget: any (scope, subject,
 * limit, window) triple, backed by `platform.rateLimitHits`
 * (migration 31) instead of a binding. Both limiters exist because they
 * solve genuinely different shapes of the same problem, not because this is
 * a second ad hoc mechanism -- every caller with a window over 60 seconds
 * goes through this one function, not a bespoke counter of its own.
 */
export interface RateLimitBudget {
  /**
   * Which budget this checks, e.g. `"team:create"`, `"team:invite:team"`.
   * One counter per (scope, subjectId) pair -- the same user hitting two
   * different scopes never shares a counter.
   */
  scope: string;
  /** The user or team id the budget is metered against. */
  subjectId: string;
  /** Hits allowed within the trailing window, inclusive of this attempt. */
  limit: number;
  /** The window's width, in seconds. */
  windowSeconds: number;
}

/**
 * Attempts to consume one hit of `budget`. Returns whether it was allowed.
 *
 * Check-and-record happens in ONE statement: an `insert ... select` gated on
 * a count of recent hits for the same (scope, subjectId), so two concurrent
 * callers racing the same budget cannot both observe "under limit" before
 * either commits. The same statement also deletes hits for that
 * (scope, subjectId) older than the window being checked -- this table's
 * entire retention story is each call pruning its own history as it goes,
 * rather than a separate cron or a TTL column.
 *
 * Callers are expected to check this BEFORE the side effect it is guarding
 * (a GitHub call, an email send), never after: a rejected attempt should
 * cost nothing beyond the one row this writes.
 */
export async function consumeRateLimit(
  budget: RateLimitBudget,
): Promise<boolean> {
  const { scope, subjectId, limit, windowSeconds } = budget;

  const rows = await db.execute<{ id: string }>(sql`
    with "pruned" as (
      delete from "platform"."rateLimitHits"
      where "scope" = ${scope}
        and "subjectId" = ${subjectId}::uuid
        and "createdAt" < now() - make_interval(secs => ${windowSeconds})
    ),
    "recent" as (
      select count(*) as "n"
      from "platform"."rateLimitHits"
      where "scope" = ${scope}
        and "subjectId" = ${subjectId}::uuid
        and "createdAt" > now() - make_interval(secs => ${windowSeconds})
    )
    insert into "platform"."rateLimitHits" ("scope", "subjectId")
    select ${scope}, ${subjectId}::uuid
    from "recent"
    where "n" < ${limit}
    returning "id"
  `);

  return rows.length > 0;
}
