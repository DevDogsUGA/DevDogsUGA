// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type {
  ClubConfig,
  Meeting,
  Question,
  QuestionsConfig,
} from "@devdogsuga/events";
import { db } from "~/server/db";
import { reconcileFromConfig } from "./reconcile";

/**
 * The reconcile against a real database: upsert, archive, un-archive and
 * idempotency, the four properties its header promises.
 *
 * All fixtures share the `reconcile-test-` id/slug prefix so `cleanup` can
 * find everything this file ever wrote without tracking individual ids
 * across tests -- the same trick as the meetings.db-test.ts fixtures beside
 * it, generalized to a whole describe block that mutates the config between
 * tests.
 */

const ANSWERER = "e4700000-0000-4000-a000-000000000001";

async function cleanup() {
  // The answerer first: deleting the account cascades to its answers and
  // their (otherwise append-only) revisions, which hold the questions.
  await db.execute(sql`delete from auth.users where id = ${ANSWERER}`);
  await db.execute(
    sql`delete from platform."surveyQuestions" where id like 'reconcile_test_%'`,
  );
  await db.execute(
    sql`delete from platform.meetings where "configId" like 'reconcile-test-%'`,
  );
}

function meeting(overrides: Partial<Meeting> & { id: string }): Meeting {
  return {
    // On `startsAt`'s Eastern date, and unique per id, as the validator wants.
    slug: `2027-01-01-${overrides.id}`,
    title: "Reconcile Test",
    summary: "A reconcile test meeting.",
    kind: null,
    building: "DLW",
    location: "124",
    startsAt: "2027-01-01T18:00:00.000Z",
    endsAt: "2027-01-01T20:00:00.000Z",
    rsvpUrl: null,
    cancelledAt: null,
    cancellationReason: null,
    countsForCredit: true,
    surveyUrl: null,
    agenda: [],
    ...overrides,
  };
}

/**
 * Every test below calls `reconcileFromConfig` with a config built from a
 * handful of `reconcile-test-` fixtures -- but `archiveMissing` (see
 * `reconcile.ts`) is global: it archives EVERY live row with a `configId`,
 * not just the ones this file wrote. A local database a developer reconciled
 * by hand (see `events.md`'s "Local development" section) can have real
 * config-derived meetings live at the same time this suite runs, and a
 * fixture-only config would archive every one of them.
 *
 * This reads back whatever is live right now, OUTSIDE the `reconcile-test-`
 * prefix, and folds it into the config passed to `reconcileFromConfig` --
 * unchanged, so the reconcile's upsert is a no-op for those rows and its
 * archive pass never sees them as missing. `meetingsToKeepAlive` is the
 * fixture's own meetings; this only ADDS to them, never replaces them.
 *
 * Also returns how many extra meetings/workshops it folded in, because those
 * rows are unchanged live rows and so land in `counts.upserted` (never
 * `archived`/`unarchived` -- see `reconcile.ts`) alongside the fixture's own.
 * A test asserting an exact `counts.meetings` object has to add this in;
 * one asserting only `.archived`/`.unarchived` can ignore it.
 */
async function liveConfig(meetingsToKeepAlive: Meeting[]): Promise<{
  config: ClubConfig;
  otherMeetings: number;
  otherWorkshops: number;
}> {
  const otherWorkshops = await db.execute<{
    meetingConfigId: string;
    configId: string;
    title: string;
    description: string | null;
    project: string | null;
  }>(sql`
    select m."configId" as "meetingConfigId", w."configId", w.title,
      w.description, w.project
    from platform.workshops w
    join platform.meetings m on m.id = w."meetingId"
    where w."configId" is not null and w."configId" not like 'reconcile-test-%'
      and w."deletedAt" is null
      and m."configId" is not null and m."configId" not like 'reconcile-test-%'
  `);

  const otherMeetings = await db.execute<{
    configId: string;
    // Nullable columns, but a row with a `configId` came from a config
    // meeting, and the config requires all three.
    nameOverride: string;
    summary: string;
    kind: Meeting["kind"];
    building: Meeting["building"];
    location: string;
    // `postgres.js` hands timestamptz columns back as ISO strings, not `Date`
    // instances -- verified against this driver, not assumed -- so these are
    // read as `string` and reparsed below rather than typed as `Date`.
    startsAt: string;
    endsAt: string;
    rsvpUrl: string | null;
    cancelledAt: string | null;
    cancellationReason: string | null;
    countsForCredit: boolean;
    surveyUrl: string | null;
    surveyQuestionIds: string[];
    slug: string;
  }>(sql`
    select "configId", slug, "nameOverride", summary, kind, building, location,
      "startsAt", "endsAt", "rsvpUrl", "cancelledAt", "cancellationReason",
      "countsForCredit", "surveyUrl", "surveyQuestionIds"
    from platform.meetings
    where "configId" is not null and "configId" not like 'reconcile-test-%'
      and "deletedAt" is null
  `);

  return {
    config: {
      meetings: [
        ...meetingsToKeepAlive,
        ...otherMeetings.map((row): Meeting => ({
          id: row.configId,
          slug: row.slug,
          title: row.nameOverride,
          summary: row.summary,
          kind: row.kind,
          building: row.building,
          location: row.location,
          // Postgres's own text format ("2026-09-14 22:00:00+00") rather
          // than ISO-8601 -- reparsed through `Date` so `isoInstant`'s
          // schema (which the config's own `startsAt`/`endsAt` already
          // satisfy) does not have to special-case a space where a "T"
          // belongs.
          startsAt: new Date(row.startsAt).toISOString(),
          endsAt: new Date(row.endsAt).toISOString(),
          rsvpUrl: row.rsvpUrl,
          cancelledAt: row.cancelledAt
            ? new Date(row.cancelledAt).toISOString()
            : null,
          cancellationReason: row.cancellationReason,
          countsForCredit: row.countsForCredit,
          surveyUrl: row.surveyUrl,
          ...(row.surveyQuestionIds.length > 0
            ? { questions: row.surveyQuestionIds }
            : {}),
          agenda: otherWorkshops
            .filter((w) => w.meetingConfigId === row.configId)
            .map((w) => ({
              id: w.configId,
              title: w.title,
              description: w.description,
              project: w.project,
            })),
        })),
      ],
    },
    otherMeetings: otherMeetings.length,
    otherWorkshops: otherWorkshops.length,
  };
}

async function liveMeetingByConfigId(configId: string) {
  const rows = await db.execute<{
    id: string;
    slug: string;
    deletedAt: Date | null;
    nameOverride: string | null;
  }>(sql`
    select id, slug, "deletedAt", "nameOverride" from platform.meetings
    where "configId" = ${configId}
  `);
  return rows[0] ?? null;
}

async function liveWorkshopByConfigId(configId: string) {
  const rows = await db.execute<{
    id: string;
    deletedAt: Date | null;
    title: string | null;
    project: string | null;
  }>(sql`
    select id, "deletedAt", title, project from platform.workshops
    where "configId" = ${configId}
  `);
  return rows[0] ?? null;
}

afterAll(cleanup);

describe("reconcileFromConfig", () => {
  beforeEach(cleanup);

  it("inserts a new meeting and its agenda", async () => {
    const live = await liveConfig([
      meeting({
        id: "reconcile-test-insert",
        agenda: [
          {
            id: "reconcile-test-insert-workshop",
            title: "Supabase",
            description: null,
            project: "DogDays",
          },
        ],
      }),
    ]);

    const result = await reconcileFromConfig(db, live.config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.counts.meetings).toEqual({
      upserted: 1 + live.otherMeetings,
      archived: 0,
      unarchived: 0,
    });
    expect(result.counts.workshops).toEqual({
      upserted: 1 + live.otherWorkshops,
      archived: 0,
      unarchived: 0,
    });

    const row = await liveMeetingByConfigId("reconcile-test-insert");
    expect(row).not.toBeNull();
    expect(row!.deletedAt).toBeNull();

    const workshopRow = await liveWorkshopByConfigId(
      "reconcile-test-insert-workshop",
    );
    expect(workshopRow).not.toBeNull();
    expect(workshopRow!.project).toBe("DogDays");
  });

  it("updates an existing meeting by configId rather than inserting a duplicate", async () => {
    const configId = "reconcile-test-update";
    await reconcileFromConfig(
      db,
      (await liveConfig([meeting({ id: configId, title: "Original Title" })]))
        .config,
    );
    const before = await liveMeetingByConfigId(configId);

    const live = await liveConfig([
      meeting({ id: configId, title: "Renamed Title" }),
    ]);
    const result = await reconcileFromConfig(db, live.config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.counts.meetings.upserted).toBe(1 + live.otherMeetings);

    const after = await liveMeetingByConfigId(configId);
    expect(after!.id).toBe(before!.id);
    expect(after!.nameOverride).toBe("Renamed Title");

    const count = await db.execute<{ n: number }>(sql`
      select count(*)::int as n from platform.meetings where "configId" = ${configId}
    `);
    expect(count[0]!.n).toBe(1);
  });

  it("takes the slug from config, and re-addresses the meeting when it changes", async () => {
    const configId = "reconcile-test-slug";
    await reconcileFromConfig(
      db,
      (await liveConfig([meeting({ id: configId, slug: "2027-01-01-first" })]))
        .config,
    );
    const before = await liveMeetingByConfigId(configId);
    expect(before!.slug).toBe("2027-01-01-first");

    const result = await reconcileFromConfig(
      db,
      (await liveConfig([meeting({ id: configId, slug: "2027-01-01-second" })]))
        .config,
    );
    expect(result.ok).toBe(true);
    const after = await liveMeetingByConfigId(configId);
    expect(after!.id).toBe(before!.id);
    expect(after!.slug).toBe("2027-01-01-second");
  });

  it("lets two meetings trade slugs in one run", async () => {
    // `meetings_slug_key` is not deferrable, so a naive update order would
    // collide on the first write.
    const a = "reconcile-test-swap-a";
    const b = "reconcile-test-swap-b";
    await reconcileFromConfig(
      db,
      (
        await liveConfig([
          meeting({ id: a, slug: "2027-01-01-judging" }),
          meeting({ id: b, slug: "2027-01-01-workshop" }),
        ])
      ).config,
    );

    const result = await reconcileFromConfig(
      db,
      (
        await liveConfig([
          meeting({ id: a, slug: "2027-01-01-workshop" }),
          meeting({ id: b, slug: "2027-01-01-judging" }),
        ])
      ).config,
    );
    expect(result.ok).toBe(true);
    expect((await liveMeetingByConfigId(a))!.slug).toBe("2027-01-01-workshop");
    expect((await liveMeetingByConfigId(b))!.slug).toBe("2027-01-01-judging");
  });

  it("aborts, writing nothing, when a slug belongs to a meeting outside the config", async () => {
    const keepAlive = meeting({ id: "reconcile-test-taken-keepalive" });
    const slug = "2027-01-01-taken";
    await reconcileFromConfig(
      db,
      (
        await liveConfig([
          meeting({ id: "reconcile-test-taken-old", slug }),
          keepAlive,
        ])
      ).config,
    );
    // Drops out of the config, so it is archived still holding the slug.
    await reconcileFromConfig(db, (await liveConfig([keepAlive])).config);

    const result = await reconcileFromConfig(
      db,
      (
        await liveConfig([
          meeting({ id: "reconcile-test-taken-new", slug }),
          keepAlive,
        ])
      ).config,
    );
    expect(result.ok).toBe(false);
    expect(await liveMeetingByConfigId("reconcile-test-taken-new")).toBeNull();
    expect(
      (await liveMeetingByConfigId("reconcile-test-taken-old"))!.slug,
    ).toBe(slug);
  });

  it("archives a meeting and its workshops once they drop out of the config", async () => {
    const configId = "reconcile-test-archive";
    const workshopConfigId = "reconcile-test-archive-workshop";
    await reconcileFromConfig(
      db,
      (
        await liveConfig([
          meeting({
            id: configId,
            agenda: [
              {
                id: workshopConfigId,
                title: "Session",
                description: null,
                project: null,
              },
            ],
          }),
          // A second, unrelated meeting so the config is never empty and the
          // zero-meetings guard does not intercept this test.
          meeting({ id: "reconcile-test-archive-keepalive" }),
        ])
      ).config,
    );

    const result = await reconcileFromConfig(
      db,
      (await liveConfig([meeting({ id: "reconcile-test-archive-keepalive" })]))
        .config,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // `.archived`/`.unarchived` alone, never a `toEqual` on the whole counts
    // object -- unlike `upserted`, these two are unaffected by whatever
    // `liveConfig` folds in, since every row it adds is present in every
    // config it builds and so is never counted as archived or unarchived.
    expect(result.counts.meetings.archived).toBe(1);
    expect(result.counts.workshops.archived).toBe(1);

    const row = await liveMeetingByConfigId(configId);
    expect(row!.deletedAt).not.toBeNull();
    const workshopRow = await liveWorkshopByConfigId(workshopConfigId);
    expect(workshopRow!.deletedAt).not.toBeNull();
  });

  it("un-archives a meeting that reappears in the config", async () => {
    const configId = "reconcile-test-unarchive";
    const keepAlive = meeting({ id: "reconcile-test-unarchive-keepalive" });
    await reconcileFromConfig(
      db,
      (await liveConfig([meeting({ id: configId }), keepAlive])).config,
    );
    await reconcileFromConfig(db, (await liveConfig([keepAlive])).config);
    const archived = await liveMeetingByConfigId(configId);
    expect(archived!.deletedAt).not.toBeNull();

    const result = await reconcileFromConfig(
      db,
      (await liveConfig([meeting({ id: configId }), keepAlive])).config,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.counts.meetings.unarchived).toBe(1);

    const restored = await liveMeetingByConfigId(configId);
    expect(restored!.deletedAt).toBeNull();
    // Same row, not a new one under the same configId -- the whole point of
    // keying identity on configId rather than re-inserting.
    expect(restored!.id).toBe(archived!.id);
  });

  it("is idempotent: reconciling the same config twice changes nothing the second time", async () => {
    const live = await liveConfig([
      meeting({
        id: "reconcile-test-idempotent",
        agenda: [
          {
            id: "reconcile-test-idempotent-workshop",
            title: "Session",
            description: null,
            project: null,
          },
        ],
      }),
    ]);

    await reconcileFromConfig(db, live.config);
    const result = await reconcileFromConfig(db, live.config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Both meetings and workshops already matched the config: still an
    // "upsert" (the row is written through on every pass, live or not) but
    // never an archive or an unarchive.
    expect(result.counts.meetings).toEqual({
      upserted: 1 + live.otherMeetings,
      archived: 0,
      unarchived: 0,
    });
    expect(result.counts.workshops).toEqual({
      upserted: 1 + live.otherWorkshops,
      archived: 0,
      unarchived: 0,
    });

    const count = await db.execute<{ n: number }>(sql`
      select count(*)::int as n from platform.meetings
      where "configId" = 'reconcile-test-idempotent'
    `);
    expect(count[0]!.n).toBe(1);
  });

  it("refuses to reconcile a config with zero meetings", async () => {
    const result = await reconcileFromConfig(db, { meetings: [] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/zero meetings/);
  });

  it("aborts the whole reconcile when the config fails runtime validation, writing nothing", async () => {
    const dupId = "reconcile-test-invalid";
    // Two meetings sharing an id: a shape zod's per-field checks cannot see
    // (both are independently valid `Meeting`s), which is exactly why
    // `validateClubConfig` has to run again here rather than trusting the
    // type. See reconcile.ts's header for why this aborts everything rather
    // than skipping the offending row.
    const config: ClubConfig = {
      meetings: [
        meeting({ id: dupId, title: "First" }),
        meeting({ id: dupId, title: "Second" }),
      ],
    };

    const result = await reconcileFromConfig(db, config);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/runtime validation/);

    const row = await liveMeetingByConfigId(dupId);
    expect(row).toBeNull();
  });
});

/**
 * The survey questions live right now outside the `reconcile_test_` prefix,
 * folded into each test's questions for the same reason `liveConfig` folds
 * in meetings: an unanswered question absent from the config is deleted.
 */
async function liveQuestions(fixtures: Question[]): Promise<QuestionsConfig> {
  const rows = await db.execute<{ definition: Question }>(sql`
    select definition from platform."surveyQuestions"
    where id not like 'reconcile_test_%'
  `);
  return { questions: [...fixtures, ...rows.map((r) => r.definition)] };
}

const memberQuestion: Question = {
  id: "reconcile_test_member",
  scope: "member",
  prompt: "What do you study?",
  type: "text",
};

const meetingQuestion: Question = {
  id: "reconcile_test_meeting",
  scope: "meeting",
  prompt: "How was tonight?",
  type: "scale",
  min: 1,
  max: 5,
};

async function questionRow(id: string) {
  const rows = await db.execute<{
    scope: string;
    type: string;
    definition: Question;
    retiredAt: string | null;
  }>(sql`
    select scope, type, definition, "retiredAt"
    from platform."surveyQuestions" where id = ${id}
  `);
  return rows[0] ?? null;
}

/** An answer to the member question, so it counts as answered. */
async function answerMemberQuestion() {
  await db.execute(sql`
    insert into auth.users (id, email)
    values (${ANSWERER}, 'reconcile-answerer@uga.edu')
    on conflict do nothing
  `);
  await db.execute(sql`
    insert into platform."surveyAnswers" ("userId", "questionId", answer)
    values (${ANSWERER}, ${memberQuestion.id}, '{"text":"CS"}')
  `);
}

describe("reconcileFromConfig: survey questions", () => {
  beforeEach(cleanup);

  it("copies questions and each meeting's question list", async () => {
    const id = "reconcile-test-survey";
    const { config } = await liveConfig([
      meeting({ id, questions: [meetingQuestion.id] }),
    ]);
    const result = await reconcileFromConfig(
      db,
      config,
      await liveQuestions([memberQuestion, meetingQuestion]),
    );
    expect(result.ok).toBe(true);

    expect(await questionRow(meetingQuestion.id)).toMatchObject({
      scope: "meeting",
      type: "scale",
      definition: meetingQuestion,
      retiredAt: null,
    });
    const [row] = await db.execute<{ surveyQuestionIds: string[] }>(sql`
      select "surveyQuestionIds" from platform.meetings where "configId" = ${id}
    `);
    expect(row?.surveyQuestionIds).toEqual([meetingQuestion.id]);
  });

  it("retires a question config retires, and deletes an unanswered one config drops", async () => {
    const { config } = await liveConfig([
      meeting({ id: "reconcile-test-survey" }),
    ]);
    await reconcileFromConfig(
      db,
      config,
      await liveQuestions([memberQuestion, meetingQuestion]),
    );

    const result = await reconcileFromConfig(
      db,
      config,
      await liveQuestions([{ ...memberQuestion, retired: true }]),
    );
    expect(result.ok && result.counts.questions.removed).toBe(1);
    expect((await questionRow(memberQuestion.id))?.retiredAt).not.toBeNull();
    expect(await questionRow(meetingQuestion.id)).toBeNull();
  });

  it("aborts, writing nothing, when an answered question is dropped or retyped", async () => {
    const id = "reconcile-test-survey";
    const { config } = await liveConfig([meeting({ id, title: "Before" })]);
    await reconcileFromConfig(
      db,
      config,
      await liveQuestions([memberQuestion]),
    );
    await answerMemberQuestion();

    const renamed = await liveConfig([meeting({ id, title: "After" })]);
    const dropped = await reconcileFromConfig(
      db,
      renamed.config,
      await liveQuestions([]),
    );
    expect(dropped.ok).toBe(false);
    if (!dropped.ok)
      expect(dropped.reason).toMatch(/conflict with recorded answers/);

    const retyped = await reconcileFromConfig(
      db,
      renamed.config,
      await liveQuestions([{ ...memberQuestion, type: "longText" }]),
    );
    expect(retyped.ok).toBe(false);

    expect(await questionRow(memberQuestion.id)).toMatchObject({
      type: "text",
    });
    expect((await liveMeetingByConfigId(id))?.nameOverride).toBe("Before");
  });

  it("leaves questions alone when none are passed", async () => {
    const { config } = await liveConfig([
      meeting({ id: "reconcile-test-survey" }),
    ]);
    await reconcileFromConfig(
      db,
      config,
      await liveQuestions([memberQuestion]),
    );
    const result = await reconcileFromConfig(db, config);
    expect(result.ok && result.counts.questions).toEqual({
      upserted: 0,
      removed: 0,
    });
    expect(await questionRow(memberQuestion.id)).not.toBeNull();
  });
});
