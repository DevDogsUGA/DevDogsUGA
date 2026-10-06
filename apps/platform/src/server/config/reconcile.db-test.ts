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
import { reconcileFromConfig, type WorkerVersion } from "./reconcile";

/**
 * The reconcile against a real database: upsert, archive, un-archive and
 * idempotency, the four properties its header promises.
 *
 * Every fixture's slug starts with `PREFIX`, dated on the fixtures' own
 * `startsAt` as the validator requires, so `cleanup` can find everything this
 * file ever wrote without tracking individual rows across tests.
 */

const ANSWERER = "e4700000-0000-4000-a000-000000000001";
const PREFIX = "2027-01-01-reconcile-test-";

async function cleanup() {
  // The answerer first: deleting the account cascades to its answers and
  // their (otherwise append-only) revisions, which hold the questions.
  await db.execute(sql`delete from auth.users where id = ${ANSWERER}`);
  await db.execute(
    sql`delete from platform."surveyQuestions" where id like 'reconcile_test_%'`,
  );
  await db.execute(
    sql`delete from platform.meetings where slug like ${`${PREFIX}%`}`,
  );
  // Only ever written when a Worker version is passed, which nothing but
  // the version-guard tests below do locally.
  await db.execute(sql`delete from platform."configReconcileState"`);
}

/** A fixture meeting, named by the tail of its slug. */
function meeting(name: string, overrides: Partial<Meeting> = {}): Meeting {
  return {
    slug: `${PREFIX}${name}`,
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

function workshop(title: string, project: string | null = null) {
  return { title, description: null, project };
}

/**
 * Every test below calls `reconcileFromConfig` with a config built from a
 * handful of fixtures -- but the reconcile owns every meeting: it archives
 * every live row the config doesn't list, not just the ones this file wrote.
 * A local database a developer reconciled by hand (see `events.md`'s "Local
 * development" section) can have real meetings live while this suite runs,
 * and a fixture-only config would archive every one of them.
 *
 * This reads back whatever is live right now outside `PREFIX` and folds it
 * into the config passed to `reconcileFromConfig` -- unchanged, so the
 * reconcile's upsert is a no-op for those rows and its archive pass never
 * sees them as missing. `meetingsToKeepAlive` is the fixture's own meetings;
 * this only ADDS to them, never replaces them.
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
    meetingId: string;
    title: string;
    description: string | null;
    project: string | null;
  }>(sql`
    select w."meetingId", w.title, w.description, w.project
    from platform.workshops w
    join platform.meetings m on m.id = w."meetingId"
    where w."deletedAt" is null and m."deletedAt" is null
      and m.slug not like ${`${PREFIX}%`}
  `);

  const otherMeetings = await db.execute<{
    id: string;
    slug: string;
    // Nullable columns, but every meeting came from a config meeting, and
    // the config requires all three.
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
  }>(sql`
    select id, slug, "nameOverride", summary, kind, building, location,
      "startsAt", "endsAt", "rsvpUrl", "cancelledAt", "cancellationReason",
      "countsForCredit", "surveyUrl", "surveyQuestionIds"
    from platform.meetings
    where "deletedAt" is null and slug not like ${`${PREFIX}%`}
  `);

  return {
    config: {
      meetings: [
        ...meetingsToKeepAlive,
        ...otherMeetings.map((row): Meeting => ({
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
            .filter((w) => w.meetingId === row.id)
            .map((w) => workshop(w.title, w.project)),
        })),
      ],
    },
    otherMeetings: otherMeetings.length,
    otherWorkshops: otherWorkshops.length,
  };
}

async function meetingRow(name: string) {
  const rows = await db.execute<{
    id: string;
    deletedAt: Date | null;
    nameOverride: string | null;
    surveyQuestionIds: string[];
  }>(sql`
    select id, "deletedAt", "nameOverride", "surveyQuestionIds"
    from platform.meetings where slug = ${`${PREFIX}${name}`}
  `);
  return rows[0] ?? null;
}

/** Every workshop row on a fixture meeting, archived ones too. */
async function workshopRows(name: string) {
  return db.execute<{
    id: string;
    deletedAt: Date | null;
    title: string | null;
    project: string | null;
  }>(sql`
    select w.id, w."deletedAt", w.title, w.project
    from platform.workshops w
    join platform.meetings m on m.id = w."meetingId"
    where m.slug = ${`${PREFIX}${name}`}
    order by w.title
  `);
}

afterAll(cleanup);

describe("reconcileFromConfig", () => {
  beforeEach(cleanup);

  it("inserts a new meeting and its agenda", async () => {
    const live = await liveConfig([
      meeting("insert", { agenda: [workshop("Supabase", "DogDays")] }),
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

    const row = await meetingRow("insert");
    expect(row).not.toBeNull();
    expect(row!.deletedAt).toBeNull();

    const [workshopRow] = await workshopRows("insert");
    expect(workshopRow?.project).toBe("DogDays");
  });

  it("updates an existing meeting by slug rather than inserting a duplicate", async () => {
    await reconcileFromConfig(
      db,
      (await liveConfig([meeting("update", { title: "Original Title" })]))
        .config,
    );
    const before = await meetingRow("update");

    const live = await liveConfig([
      meeting("update", { title: "Renamed Title" }),
    ]);
    const result = await reconcileFromConfig(db, live.config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.counts.meetings.upserted).toBe(1 + live.otherMeetings);

    const after = await meetingRow("update");
    expect(after!.id).toBe(before!.id);
    expect(after!.nameOverride).toBe("Renamed Title");
  });

  it("treats a changed slug as a new meeting, archiving the old one", async () => {
    await reconcileFromConfig(
      db,
      (await liveConfig([meeting("first")])).config,
    );
    const first = await meetingRow("first");

    const result = await reconcileFromConfig(
      db,
      (await liveConfig([meeting("second")])).config,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.counts.meetings.archived).toBe(1);
    expect((await meetingRow("first"))!.deletedAt).not.toBeNull();
    const second = await meetingRow("second");
    expect(second!.deletedAt).toBeNull();
    expect(second!.id).not.toBe(first!.id);
  });

  it("matches workshops on their title within the meeting, ignoring case", async () => {
    await reconcileFromConfig(
      db,
      (
        await liveConfig([
          meeting("titles", {
            agenda: [workshop("Next.js"), workshop("Flutter")],
          }),
        ])
      ).config,
    );
    const [flutter, nextjs] = await workshopRows("titles");

    // Re-cased: the same workshop. Retitled: a different one.
    const result = await reconcileFromConfig(
      db,
      (
        await liveConfig([
          meeting("titles", {
            agenda: [workshop("next.js", "DogDays"), workshop("Flutter II")],
          }),
        ])
      ).config,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.counts.workshops.archived).toBe(1);

    const rows = await workshopRows("titles");
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(nextjs!.id)).toMatchObject({
      title: "next.js",
      project: "DogDays",
      deletedAt: null,
    });
    expect(byId.get(flutter!.id)!.deletedAt).not.toBeNull();
    expect(
      rows.filter((r) => r.deletedAt === null).map((r) => r.title),
    ).toEqual(["Flutter II", "next.js"]);
  });

  it("archives a meeting and its workshops once they drop out of the config", async () => {
    await reconcileFromConfig(
      db,
      (
        await liveConfig([
          meeting("archive", { agenda: [workshop("Session")] }),
          // A second, unrelated meeting so the config is never empty and the
          // zero-meetings guard does not intercept this test.
          meeting("archive-keepalive"),
        ])
      ).config,
    );

    const result = await reconcileFromConfig(
      db,
      (await liveConfig([meeting("archive-keepalive")])).config,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // `.archived`/`.unarchived` alone, never a `toEqual` on the whole counts
    // object -- unlike `upserted`, these two are unaffected by whatever
    // `liveConfig` folds in, since every row it adds is present in every
    // config it builds and so is never counted as archived or unarchived.
    expect(result.counts.meetings.archived).toBe(1);
    expect(result.counts.workshops.archived).toBe(1);

    expect((await meetingRow("archive"))!.deletedAt).not.toBeNull();
    const [workshopRow] = await workshopRows("archive");
    expect(workshopRow!.deletedAt).not.toBeNull();
  });

  it("un-archives a meeting that reappears in the config", async () => {
    const keepAlive = meeting("unarchive-keepalive");
    await reconcileFromConfig(
      db,
      (await liveConfig([meeting("unarchive"), keepAlive])).config,
    );
    await reconcileFromConfig(db, (await liveConfig([keepAlive])).config);
    const archived = await meetingRow("unarchive");
    expect(archived!.deletedAt).not.toBeNull();

    const result = await reconcileFromConfig(
      db,
      (await liveConfig([meeting("unarchive"), keepAlive])).config,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.counts.meetings.unarchived).toBe(1);

    const restored = await meetingRow("unarchive");
    expect(restored!.deletedAt).toBeNull();
    // Same row, not a new one under the same slug -- so the attendance
    // recorded against it comes back with it.
    expect(restored!.id).toBe(archived!.id);
  });

  it("is idempotent: reconciling the same config twice changes nothing the second time", async () => {
    const live = await liveConfig([
      meeting("idempotent", { agenda: [workshop("Session")] }),
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
    expect(await workshopRows("idempotent")).toHaveLength(1);
  });

  it("refuses to reconcile a config with zero meetings", async () => {
    const result = await reconcileFromConfig(db, { meetings: [] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/zero meetings/);
  });

  it("aborts the whole reconcile when the config fails runtime validation, writing nothing", async () => {
    // Two meetings sharing a slug: a shape zod's per-field checks cannot see
    // (both are independently valid `Meeting`s), which is exactly why
    // `validateClubConfig` has to run again here rather than trusting the
    // type. See reconcile.ts's header for why this aborts everything rather
    // than skipping the offending row.
    const config: ClubConfig = {
      meetings: [
        meeting("invalid", { title: "First" }),
        meeting("invalid", { title: "Second" }),
      ],
    };

    const result = await reconcileFromConfig(db, config);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/runtime validation/);
    expect(await meetingRow("invalid")).toBeNull();
  });
});

describe("reconcileFromConfig: newest Worker wins", () => {
  beforeEach(cleanup);

  const older: WorkerVersion = {
    id: "older-version",
    timestamp: "2026-10-05T22:00:00.000Z",
  };
  const newer: WorkerVersion = {
    id: "newer-version",
    timestamp: "2026-10-05T22:37:00.000Z",
  };

  async function state() {
    const rows = await db.execute<{ workerVersionId: string }>(
      sql`select "workerVersionId" from platform."configReconcileState"`,
    );
    return rows[0]?.workerVersionId ?? null;
  }

  it("refuses a version uploaded before the one that last applied, writing nothing", async () => {
    const renamed = await liveConfig([
      meeting("guard", { title: "Build Session" }),
    ]);
    expect(
      await reconcileFromConfig(db, renamed.config, undefined, newer),
    ).toMatchObject({ ok: true });

    // The previous Worker, still serving, with its old copy of the config.
    const stale = await liveConfig([
      meeting("guard", { title: "Judging" }),
      meeting("guard-only-old"),
    ]);
    const result = await reconcileFromConfig(
      db,
      stale.config,
      undefined,
      older,
    );
    expect(result).toEqual({
      ok: false,
      reason: "superseded",
      appliedBy: newer,
    });
    expect((await meetingRow("guard"))?.nameOverride).toBe("Build Session");
    expect(await meetingRow("guard-only-old")).toBeNull();
    expect(await state()).toBe(newer.id);
  });

  it("lets a newer version apply after an older one, and records it", async () => {
    const { config } = await liveConfig([meeting("guard")]);
    await reconcileFromConfig(db, config, undefined, older);
    const result = await reconcileFromConfig(db, config, undefined, newer);
    expect(result.ok).toBe(true);
    expect(await state()).toBe(newer.id);
  });

  it("reports a change only when the config differs or a row was archived or revived", async () => {
    const first = await liveConfig([meeting("guard")]);
    const applied = await reconcileFromConfig(
      db,
      first.config,
      undefined,
      newer,
    );
    expect(applied.ok && applied.changed).toBe(true);

    const again = await reconcileFromConfig(db, first.config, undefined, newer);
    expect(again.ok && again.changed).toBe(false);

    const retitled = await liveConfig([
      meeting("guard", { title: "Retitled" }),
    ]);
    const edited = await reconcileFromConfig(
      db,
      retitled.config,
      undefined,
      newer,
    );
    expect(edited.ok && edited.changed).toBe(true);

    // Same config as last applied, but a row it lists was archived behind
    // its back: putting it back is a change the cache has to hear about.
    await db.execute(
      sql`update platform.meetings set "deletedAt" = now() where slug = ${`${PREFIX}guard`}`,
    );
    const revived = await reconcileFromConfig(
      db,
      retitled.config,
      undefined,
      newer,
    );
    expect(revived.ok && revived.changed).toBe(true);
  });

  it("without a version, records nothing and always reports a change", async () => {
    const { config } = await liveConfig([meeting("guard")]);
    await reconcileFromConfig(db, config);
    const result = await reconcileFromConfig(db, config);
    expect(result.ok && result.changed).toBe(true);
    expect(await state()).toBeNull();
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
    const { config } = await liveConfig([
      meeting("survey", { questions: [meetingQuestion.id] }),
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
    expect((await meetingRow("survey"))?.surveyQuestionIds).toEqual([
      meetingQuestion.id,
    ]);
  });

  it("retires a question config retires, and deletes an unanswered one config drops", async () => {
    const { config } = await liveConfig([meeting("survey")]);
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
    const { config } = await liveConfig([
      meeting("survey", { title: "Before" }),
    ]);
    await reconcileFromConfig(
      db,
      config,
      await liveQuestions([memberQuestion]),
    );
    await answerMemberQuestion();

    const renamed = await liveConfig([meeting("survey", { title: "After" })]);
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
    expect((await meetingRow("survey"))?.nameOverride).toBe("Before");
  });

  it("leaves questions alone when none are passed", async () => {
    const { config } = await liveConfig([meeting("survey")]);
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
