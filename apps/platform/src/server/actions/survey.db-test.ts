// @vitest-environment node
import type { Question } from "@devdogsuga/events";
import { sql } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { db } from "~/server/db";
import { ASKED, OTHER, fieldName, otherFieldName } from "~/server/survey/form";

/**
 * `saveSurvey` and `getSurvey` against a real database: who may answer, what
 * is written (only changes, each with a revision, under one audit event),
 * clearing, the meeting window, and what the page then shows.
 *
 * Questions are fixtures prefixed `survey_test_`; a member question in the
 * local database outside that prefix is asked too, and so must not be
 * required for these to pass (none in questions.json is).
 */

const session = vi.hoisted(() => ({ userId: "" }));
vi.mock("~/server/auth", () => ({
  expectSession: () => Promise.resolve(session.userId),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { saveSurvey } = await import("~/server/actions/survey");
const { getSurvey } = await import("~/server/survey/load");

const IDS = {
  member: "e4700000-0000-4000-a000-000000000011",
  stranger: "e4700000-0000-4000-a000-000000000012",
  meeting: "e4700000-0000-4000-a000-000000000013",
  earlier: "e4700000-0000-4000-a000-000000000014",
  closed: "e4700000-0000-4000-a000-000000000015",
};

const experience: Question = {
  id: "survey_test_experience",
  scope: "member",
  prompt: "Experience?",
  type: "choice",
  options: [
    { id: "beginner", label: "Beginner" },
    { id: "advanced", label: "Advanced" },
  ],
};

const learn: Question = {
  id: "survey_test_learn",
  scope: "meeting",
  prompt: "How did you hear?",
  type: "choice",
  options: [{ id: "discord", label: "Discord" }],
  other: true,
  required: true,
};

const working: Question = {
  id: "survey_test_working",
  scope: "meeting",
  prompt: "Working on?",
  type: "text",
  prefill: "last",
};

const QUESTIONS = [experience, learn, working];

async function cleanup() {
  await db.transaction(async (tx) => {
    await tx.execute(sql`set local session_replication_role = replica`);
    await tx.execute(sql`
      delete from platform."auditEvents"
      where "actorUserId" in (${IDS.member}::uuid, ${IDS.stranger}::uuid)
    `);
  });
  // Deleting the accounts cascades to answers and their revisions.
  await db.execute(
    sql`delete from auth.users where id in (${IDS.member}::uuid, ${IDS.stranger}::uuid)`,
  );
  await db.execute(sql`
    delete from platform.meetings
    where id in (${IDS.meeting}::uuid, ${IDS.earlier}::uuid, ${IDS.closed}::uuid)
  `);
  await db.execute(
    sql`delete from platform."surveyQuestions" where id like 'survey_test_%'`,
  );
}

async function meeting(id: string, slug: string, endedDaysAgo: number) {
  await db.execute(sql`
    insert into platform.meetings
      (id, slug, "startsAt", "endsAt", "countsForCredit", "surveyQuestionIds")
    values (${id}::uuid, ${slug},
      now() - make_interval(days => ${endedDaysAgo}) - interval '2 hours',
      now() - make_interval(days => ${endedDaysAgo}), true,
      array[${learn.id}, ${working.id}])
  `);
  await db.execute(sql`
    insert into platform.attendance ("userId", "meetingId", method)
    values (${IDS.member}::uuid, ${id}::uuid, 'qr')
  `);
}

beforeAll(async () => {
  await cleanup();
  for (const [id, email] of [
    [IDS.member, "survey-action-test@uga.edu"],
    [IDS.stranger, "survey-action-stranger@uga.edu"],
  ] as const) {
    await db.execute(sql`
      insert into auth.users (id, instance_id, aud, role, email)
      values (${id}::uuid, '00000000-0000-0000-0000-000000000000',
              'authenticated', 'authenticated', ${email})
    `);
  }
  for (const q of QUESTIONS) {
    await db.execute(sql`
      insert into platform."surveyQuestions" (id, scope, type, definition)
      values (${q.id}, ${q.scope}, ${q.type}, ${JSON.stringify(q)}::jsonb)
    `);
  }
  await meeting(IDS.earlier, "survey-test-earlier", 3);
  await meeting(IDS.meeting, "survey-test-meeting", 0);
  await meeting(IDS.closed, "survey-test-closed", 30);
});

afterAll(cleanup);

beforeEach(() => {
  session.userId = IDS.member;
});

function form(meetingId: string, entries: [string, string][]): FormData {
  const data = new FormData();
  data.set("meetingId", meetingId);
  for (const q of QUESTIONS) data.append(ASKED, q.id);
  for (const [k, v] of entries) data.append(k, v);
  return data;
}

const initial = { ok: false, message: "" };

async function answers(userId: string) {
  return db.execute<{
    questionId: string;
    meetingId: string | null;
    answer: unknown;
  }>(sql`
    select "questionId", "meetingId", answer from platform."surveyAnswers"
    where "userId" = ${userId}::uuid and "questionId" like 'survey_test_%'
    order by "questionId", "meetingId"
  `);
}

async function revisionCount() {
  const [row] = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from platform."surveyAnswerRevisions"
    where "userId" = ${IDS.member}::uuid
  `);
  return row!.n;
}

describe("saveSurvey", () => {
  it("refuses someone with no attendance at the meeting", async () => {
    session.userId = IDS.stranger;
    const state = await saveSurvey(
      initial,
      form(IDS.meeting, [[fieldName(learn.id), "discord"]]),
    );
    expect(state).toMatchObject({ ok: false });
    expect(state.message).toMatch(/Check in/);
    expect(await answers(IDS.stranger)).toEqual([]);
  });

  it("names a required question left blank and saves nothing", async () => {
    const state = await saveSurvey(
      initial,
      form(IDS.meeting, [[fieldName(experience.id), "beginner"]]),
    );
    expect(state.ok).toBe(false);
    expect(state.errors).toEqual({ [learn.id]: "Answer this question." });
    expect(await answers(IDS.member)).toEqual([]);
  });

  it("saves member and meeting answers, each with a revision, under one audit event", async () => {
    await saveSurvey(
      initial,
      form(IDS.earlier, [
        [fieldName(learn.id), "discord"],
        [fieldName(working.id), "DogDays"],
      ]),
    );
    const before = await revisionCount();
    const state = await saveSurvey(
      initial,
      form(IDS.meeting, [
        [fieldName(experience.id), "advanced"],
        [fieldName(learn.id), OTHER],
        [otherFieldName(learn.id), "A flyer"],
      ]),
    );
    expect(state).toMatchObject({ ok: true, message: "Answers saved." });
    expect(await answers(IDS.member)).toEqual([
      {
        questionId: experience.id,
        meetingId: null,
        answer: { option: "advanced" },
      },
      {
        questionId: learn.id,
        meetingId: IDS.meeting,
        answer: { other: "A flyer" },
      },
      {
        questionId: learn.id,
        meetingId: IDS.earlier,
        answer: { option: "discord" },
      },
      {
        questionId: working.id,
        meetingId: IDS.earlier,
        answer: { text: "DogDays" },
      },
    ]);
    expect((await revisionCount()) - before).toBe(2);

    const [event] = await db.execute<{
      metadata: { questionIds: string[] };
    }>(sql`
      select metadata from platform."auditEvents"
      where "actorUserId" = ${IDS.member}::uuid and "targetId" = ${IDS.meeting}
        and action = 'survey.saved'
    `);
    expect(event?.metadata.questionIds.sort()).toEqual([
      experience.id,
      learn.id,
    ]);
  });

  it("writes nothing when nothing changed, and clears a blanked answer", async () => {
    const before = await revisionCount();
    const unchanged = await saveSurvey(
      initial,
      form(IDS.meeting, [
        [fieldName(experience.id), "advanced"],
        [fieldName(learn.id), OTHER],
        [otherFieldName(learn.id), "A flyer"],
      ]),
    );
    expect(unchanged.message).toBe("Nothing changed.");
    expect(await revisionCount()).toBe(before);

    await saveSurvey(
      initial,
      form(IDS.meeting, [
        [fieldName(learn.id), OTHER],
        [otherFieldName(learn.id), "A flyer"],
      ]),
    );
    const rows = await answers(IDS.member);
    expect(rows.some((r) => r.questionId === experience.id)).toBe(false);
    const [cleared] = await db.execute<{ answer: unknown }>(sql`
      select answer from platform."surveyAnswerRevisions"
      where "userId" = ${IDS.member}::uuid and "questionId" = ${experience.id}
      order by "recordedAt" desc limit 1
    `);
    expect(cleared?.answer).toBeNull();
  });

  it("takes member answers but not meeting answers after the window closes", async () => {
    const state = await saveSurvey(
      initial,
      form(IDS.closed, [[fieldName(experience.id), "beginner"]]),
    );
    expect(state.ok).toBe(true);
    const rows = await answers(IDS.member);
    expect(rows.some((r) => r.meetingId === IDS.closed)).toBe(false);
    expect(rows.find((r) => r.questionId === experience.id)?.answer).toEqual({
      option: "beginner",
    });
  });

  it("leaves a question the form did not show alone", async () => {
    const data = new FormData();
    data.set("meetingId", IDS.meeting);
    data.append(ASKED, learn.id);
    data.append(fieldName(learn.id), OTHER);
    data.append(otherFieldName(learn.id), "A flyer");
    const before = await answers(IDS.member);
    await saveSurvey(initial, data);
    expect(await answers(IDS.member)).toEqual(before);
  });
});

describe("getSurvey", () => {
  it("splits saved member answers from unanswered ones and prefills from the last meeting", async () => {
    const survey = await getSurvey(IDS.member, IDS.meeting);
    expect(survey?.meetingOpen).toBe(true);
    expect(survey?.saved.map((i) => i.question.id)).toContain(experience.id);
    expect(survey?.unanswered.map((i) => i.question.id)).not.toContain(
      experience.id,
    );
    expect(survey?.meeting).toEqual([
      { question: learn, answer: { other: "A flyer" } },
      { question: working, answer: { text: "DogDays" } },
    ]);
  });

  it("is nothing for a meeting the member did not attend", async () => {
    expect(await getSurvey(IDS.stranger, IDS.meeting)).toBeNull();
  });
});
