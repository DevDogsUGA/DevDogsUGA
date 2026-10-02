import type { Answer, Question } from "@devdogsuga/events";
import { sql } from "drizzle-orm";
import { db } from "~/server/db";
import { reflectionDeadline } from "~/server/reflections/policy";

/**
 * The check-in survey for one member at one meeting they attended.
 *
 * Member questions are asked everywhere: unanswered ones open, answered ones
 * kept under "saved answers" to edit. Meeting questions are the ones this
 * meeting lists, each with this meeting's answer, or -- for `prefill: "last"`
 * -- the member's answer at their latest other meeting to start from. They
 * can be answered until the reflection window after the meeting closes, the
 * same window as its EL reflection; member answers never close. Retired
 * questions are not asked.
 */

type Database = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface SurveyItem {
  question: Question;
  /** The saved answer, or for a meeting question a prefill from last time. */
  answer: Answer | null;
}

export interface Survey {
  meetingId: string;
  meetingLabel: string;
  unanswered: SurveyItem[];
  saved: SurveyItem[];
  meeting: SurveyItem[];
  /** When this meeting's questions stop taking answers. */
  deadline: Date;
  meetingOpen: boolean;
}

export interface SurveyMeeting {
  id: string;
  label: string;
  endsAt: Date;
}

/** The meeting, if the member's attendance there is on record and it stands. */
export async function attendedMeeting(
  database: Database,
  userId: string,
  meetingId: string,
): Promise<SurveyMeeting | null> {
  const rows = await database.execute<{
    id: string;
    label: string;
    endsAt: string;
  }>(sql`
    select m.id, coalesce(m."nameOverride", m.kind, 'Meeting') as label,
      m."endsAt"
    from platform.attendance a
    join platform.meetings m on m.id = a."meetingId"
    where a."userId" = ${userId}::uuid and m.id = ${meetingId}::uuid
      and m."deletedAt" is null and m."cancelledAt" is null
  `);
  const row = rows[0];
  return row ? { ...row, endsAt: new Date(row.endsAt) } : null;
}

/** The live questions this meeting asks: every member question, then its own. */
export async function questionsFor(
  database: Database,
  meetingId: string,
): Promise<{ member: Question[]; meeting: Question[] }> {
  const rows = await database.execute<{
    definition: Question;
    position: number | null;
  }>(sql`
    select q.definition,
      array_position(m."surveyQuestionIds", q.id) as position
    from platform."surveyQuestions" q
    cross join platform.meetings m
    where m.id = ${meetingId}::uuid and q."retiredAt" is null
      and (q.scope = 'member'
        or (q.scope = 'meeting' and q.id = any(m."surveyQuestionIds")))
  `);
  const member = rows
    .filter((r) => r.definition.scope === "member")
    .map((r) => r.definition);
  const meeting = rows
    .filter((r) => r.definition.scope === "meeting")
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((r) => r.definition);
  return { member, meeting };
}

export async function submissionWindowDays(
  database: Database,
): Promise<number> {
  const rows = await database.execute<{ submissionWindowDays: number }>(sql`
    select "submissionWindowDays" from platform."reflectionSettings" where id = true
  `);
  return rows[0]?.submissionWindowDays ?? 7;
}

export async function getSurvey(
  userId: string,
  meetingId: string,
  now = new Date(),
): Promise<Survey | null> {
  const meeting = await attendedMeeting(db, userId, meetingId);
  if (!meeting) return null;
  const questions = await questionsFor(db, meetingId);
  if (questions.member.length + questions.meeting.length === 0) return null;

  const answers = await db.execute<{
    questionId: string;
    meetingId: string | null;
    answer: Answer;
  }>(sql`
    select "questionId", "meetingId", answer
    from platform."surveyAnswers"
    where "userId" = ${userId}::uuid
      and ("meetingId" is null or "meetingId" = ${meetingId}::uuid)
  `);
  const memberAnswer = new Map(
    answers
      .filter((a) => a.meetingId === null)
      .map((a) => [a.questionId, a.answer]),
  );
  const meetingAnswer = new Map(
    answers
      .filter((a) => a.meetingId !== null)
      .map((a) => [a.questionId, a.answer]),
  );

  const prefillIds = questions.meeting
    .filter((q) => q.prefill === "last" && !meetingAnswer.has(q.id))
    .map((q) => q.id);
  const previous = new Map<string, Answer>();
  if (prefillIds.length > 0) {
    const rows = await db.execute<{ questionId: string; answer: Answer }>(sql`
      select distinct on ("questionId") "questionId", answer
      from platform."surveyAnswers"
      where "userId" = ${userId}::uuid and "meetingId" <> ${meetingId}::uuid
        and "questionId" in (${sql.join(
          prefillIds.map((id) => sql`${id}`),
          sql`, `,
        )})
      order by "questionId", "updatedAt" desc
    `);
    for (const row of rows) previous.set(row.questionId, row.answer);
  }

  const deadline = reflectionDeadline(
    meeting.endsAt,
    await submissionWindowDays(db),
  );
  const asked = questions.member.map((question) => ({
    question,
    answer: memberAnswer.get(question.id) ?? null,
  }));
  return {
    meetingId,
    meetingLabel: meeting.label,
    unanswered: asked.filter((item) => item.answer === null),
    saved: asked.filter((item) => item.answer !== null),
    meeting: questions.meeting.map((question) => ({
      question,
      answer:
        meetingAnswer.get(question.id) ?? previous.get(question.id) ?? null,
    })),
    deadline,
    meetingOpen: now <= deadline,
  };
}
