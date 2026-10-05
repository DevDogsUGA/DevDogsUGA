import { sql, type SQL } from "drizzle-orm";

/**
 * Wraps a Drizzle subquery so it can sit in a `select` as a scalar.
 *
 * This exists because the obvious spelling is silently wrong. Writing the
 * correlated count as a raw template:
 *
 * ```
 * sql`(select count(*)::int from ${attendance}
 *      where ${attendance.meetingId} = ${meetings.id})`
 * ```
 *
 * renders BOTH column references unqualified: `where "meetingId" = "id"`.
 * Inside the subquery those resolve against the inner table, so it asks
 * `attendance.meetingId = attendance.id`, which is never true. The query is
 * valid SQL, Postgres runs it without complaint, and every count comes back
 * zero. Interpolating a query BUILDER instead makes Drizzle qualify both
 * sides: `"platform"."attendance"."meetingId" = "platform"."meetings"."id"`.
 *
 * Measured on 2026-08-22 against the local stack: the raw form returned 0
 * workshops for a meeting with two, and this form returned 2.
 */
export function correlatedCount(subquery: { getSQL(): SQL }): SQL<number> {
  return sql<number>`(${subquery})`;
}
