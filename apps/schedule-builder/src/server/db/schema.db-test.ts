// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "~/server/db";

/**
 * The `schedule_builder` shape itself, against the real local Postgres.
 *
 * A unit test cannot see any of this: the columns Drizzle declares are only
 * ever checked against Postgres by a real `create table`/`alter table`, and the
 * composite foreign key from `offerings` to `partsOfTerm` is enforced entirely
 * inside the database, with no application code that could be unit-tested in
 * its place. `active` is gone in favor of `cancelled` (a scrape marks a section
 * cancelled rather than deleting it) plus `lastSeenAt` (when the scrape last
 * saw it at all); the four RateMyProfessors columns are gone from
 * `instructors` now that nothing reads them; and `offeringSearch`, which has to
 * be rebuilt from scratch because a materialized view's column list cannot be
 * ALTERed, has to carry `cancelled` forward instead of `active`.
 */

const ACADEMIC_PERIOD = 900001;
const PART_OF_TERM_CODE = "DBTEST";
const VALID_CRN = 9000001;
const INVALID_CRN = 9000002;

const NAMES = {
  college: "DB Test College (schema.db-test)",
  subjectAbbr: "DBT1",
  courseAbbr: "DBTEST-101 (schema.db-test)",
  scheduleTypeAbbr: "DBT",
  campusAbbr: "DBT",
};

// A type alias, not an `interface`: `db.execute<T>` constrains `T` to
// `Record<string, unknown>`, and only object-literal types (not named
// interfaces) get the implicit index signature that satisfies it.
type Row = {
  id: number;
};

/**
 * The SQLSTATE of a failed statement, or null if this is not a driver error.
 *
 * Drizzle wraps every failed statement in a `DrizzleQueryError` whose own
 * `.message` is just the query text; the driver's actual Postgres error
 * (`code`, and the real "violates foreign key constraint" message) is on
 * `.cause`. Walked rather than unwrapped once in case a transaction adds
 * another layer.
 */
function sqlState(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; depth < 5; depth += 1) {
    if (typeof current !== "object" || current === null) return null;
    const candidate = current as { code?: unknown; cause?: unknown };
    if (typeof candidate.code === "string") return candidate.code;
    current = candidate.cause;
  }
  return null;
}

let collegeId: number;
let subjectId: number;
let courseId: number;
let scheduleTypeId: number;
let campusId: number;

/**
 * Deletes by natural key rather than by the surrogate ids `seed()` captures,
 * so this doubles as the pre-seed cleanup for a previous run that crashed
 * before its own `afterAll` ran.
 */
async function cleanup() {
  await db.execute(
    sql`delete from schedule_builder.offerings where crn in (${VALID_CRN}, ${INVALID_CRN})`,
  );
  await db.execute(
    sql`delete from schedule_builder.courses where abbr = ${NAMES.courseAbbr}`,
  );
  await db.execute(
    sql`delete from schedule_builder.subjects where abbr = ${NAMES.subjectAbbr}`,
  );
  await db.execute(
    sql`delete from schedule_builder.colleges where description = ${NAMES.college}`,
  );
  await db.execute(
    sql`delete from schedule_builder."partsOfTerm" where "academicPeriod" = ${ACADEMIC_PERIOD}`,
  );
  await db.execute(
    sql`delete from schedule_builder.terms where "academicPeriod" = ${ACADEMIC_PERIOD}`,
  );
  await db.execute(
    sql`delete from schedule_builder."scheduleTypes" where abbr = ${NAMES.scheduleTypeAbbr}`,
  );
  await db.execute(
    sql`delete from schedule_builder.campuses where abbr = ${NAMES.campusAbbr}`,
  );
}

/**
 * The parent rows a valid `offerings` insert needs: a term, a part of term
 * for that term, and the four catalog rows `offerings` itself points at. None
 * of this exercises the columns under test directly; it exists so test (d)
 * below has a real (academicPeriod, partOfTerm) pair to accept, and a real
 * courseId/scheduleTypeId/campusId to satisfy the other not-null FKs.
 */
async function seed() {
  await db.execute(sql`
    insert into schedule_builder.terms ("academicPeriod", description)
    values (${ACADEMIC_PERIOD}, 'DB Test Term')
  `);
  await db.execute(sql`
    insert into schedule_builder."partsOfTerm"
      ("academicPeriod", code, description, "classesBegin", "dropAddEnds",
       "censusDate", "withdrawalDeadline", "classesEnd")
    values (${ACADEMIC_PERIOD}, ${PART_OF_TERM_CODE}, 'DB Test Part of Term',
            '2026-01-01', '2026-01-08', '2026-01-15', '2026-04-01', '2026-05-01')
  `);

  const [college] = await db.execute<Row>(sql`
    insert into schedule_builder.colleges (description)
    values (${NAMES.college}) returning id
  `);
  collegeId = college!.id;

  const [subject] = await db.execute<Row>(sql`
    insert into schedule_builder.subjects (abbr, description)
    values (${NAMES.subjectAbbr}, 'DB Test Subject') returning id
  `);
  subjectId = subject!.id;

  const [course] = await db.execute<Row>(sql`
    insert into schedule_builder.courses
      (abbr, title, "abbrTitle", "courseNumber", "minCreditHours",
       "maxCreditHours", "minBillingCreditHours", "collegeId", "subjectId")
    values (${NAMES.courseAbbr}, 'DB Test Course', 'DB Test Course', '101',
            3, 3, 3, ${collegeId}, ${subjectId})
    returning id
  `);
  courseId = course!.id;

  const [scheduleType] = await db.execute<Row>(sql`
    insert into schedule_builder."scheduleTypes" (abbr, description)
    values (${NAMES.scheduleTypeAbbr}, 'DB Test Schedule Type') returning id
  `);
  scheduleTypeId = scheduleType!.id;

  const [campus] = await db.execute<Row>(sql`
    insert into schedule_builder.campuses (abbr, description)
    values (${NAMES.campusAbbr}, 'DB Test Campus') returning id
  `);
  campusId = campus!.id;
}

beforeAll(async () => {
  await cleanup();
  await seed();
});

afterAll(cleanup);

async function columnsOf(tableName: string) {
  const rows = await db.execute<{ column_name: string }>(sql`
    select column_name
      from information_schema.columns
     where table_schema = 'schedule_builder' and table_name = ${tableName}
  `);
  return rows.map((r) => r.column_name);
}

/**
 * `information_schema.columns` does not carry materialized views (confirmed
 * against this same local stack: it returns zero rows for `offeringSearch`
 * even though the view exists), so its columns have to come from the catalog
 * directly.
 */
async function matviewColumnsOf(tableName: string) {
  const rows = await db.execute<{ attname: string }>(sql`
    select a.attname
      from pg_attribute a
      join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'schedule_builder'
       and c.relname = ${tableName}
       and a.attnum > 0
       and not a.attisdropped
  `);
  return rows.map((r) => r.attname);
}

describe("offerings", () => {
  it("drops `active` in favor of `cancelled` and `lastSeenAt`", async () => {
    const columns = await columnsOf("offerings");
    expect(columns).not.toContain("active");
    expect(columns).toContain("cancelled");
    expect(columns).toContain("lastSeenAt");
  });

  it("accepts a row whose (academicPeriod, partOfTerm) matches a real part of term", async () => {
    await expect(
      db.execute(sql`
        insert into schedule_builder.offerings
          (crn, "minimumEnrollment", "maximumEnrollment", "actualEnrollment",
           "seatsAvailable", "academicPeriod", "partOfTerm", "courseId",
           "scheduleTypeId", "campusId")
        values (${VALID_CRN}, 0, 30, 10, 20, ${ACADEMIC_PERIOD},
                ${PART_OF_TERM_CODE}, ${courseId}, ${scheduleTypeId}, ${campusId})
      `),
    ).resolves.toBeDefined();
  });

  it("rejects a row whose (academicPeriod, partOfTerm) has no matching partsOfTerm row", async () => {
    // The composite FK this package adds. Before it, an offering could name a
    // part of term that plain does not exist for its term, and nothing in the
    // database would know.
    const error = await db
      .execute(
        sql`
          insert into schedule_builder.offerings
            (crn, "minimumEnrollment", "maximumEnrollment", "actualEnrollment",
             "seatsAvailable", "academicPeriod", "partOfTerm", "courseId",
             "scheduleTypeId", "campusId")
          values (${INVALID_CRN}, 0, 30, 10, 20, ${ACADEMIC_PERIOD}, 'NOPE',
                  ${courseId}, ${scheduleTypeId}, ${campusId})
        `,
      )
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    // 23503 is Postgres's SQLSTATE for a foreign key violation.
    expect(sqlState(error)).toBe("23503");
  });
});

describe("instructors", () => {
  it("drops all four RateMyProfessors rating columns", async () => {
    const columns = await columnsOf("instructors");
    expect(columns).not.toContain("totalReviews");
    expect(columns).not.toContain("averageRating");
    expect(columns).not.toContain("difficultyRating");
    expect(columns).not.toContain("wouldTakeAgainRating");
  });
});

describe("offeringSearch", () => {
  it("tracks `cancelled`, not `active`", async () => {
    const columns = await matviewColumnsOf("offeringSearch");
    expect(columns).toContain("cancelled");
    expect(columns).not.toContain("active");
  });
});
