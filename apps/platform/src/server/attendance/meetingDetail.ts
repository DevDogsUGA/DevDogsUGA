import type { Answer, Question } from "@devdogsuga/events";
import { describeAnswer } from "@devdogsuga/events";
import { sql } from "drizzle-orm";
import type { AttendanceCount } from "~/lib/attendanceCount";
import { inviteState, type InviteState } from "~/lib/attendanceInvite";
import {
  syncTodos,
  type AttendanceChange,
  type SyncTodo,
} from "~/lib/attendanceSync";
import { tallyQuestion, type QuestionTally } from "~/lib/surveyTally";
import { db } from "~/server/db";
import { questionsFor } from "~/server/survey/load";

/**
 * Everything the console's per-meeting page reads (meeting detail, Q10 to
 * Q13). Raw SQL returns timestamps as text, so each is converted here.
 */

export interface DetailAttendee {
  id: string;
  userId: string | null;
  /** Null once the member's account is gone. */
  name: string | null;
  method: "qr" | "manual_code" | "import" | "officer";
  recordedAt: Date;
  isOfficer: boolean;
  /** For method officer only: who added them. */
  addedBy: { name: string | null } | null;
  survey: {
    answered: number;
    asked: number;
    answers: { prompt: string; answer: string }[];
  };
}

export interface DetailInvite {
  id: string;
  ugaEmail: string;
  createdAt: Date;
  expiresAt: Date;
  state: InviteState;
  createdByName: string | null;
}

export interface DetailTodo extends SyncTodo {
  name: string | null;
  email: string | null;
}

export interface MeetingDetail {
  counts: AttendanceCount;
  attendees: DetailAttendee[];
  invites: DetailInvite[];
  questions: Question[];
  tallies: QuestionTally[];
  /** Null when the meeting has not been exported yet. */
  lastExportAt: Date | null;
  todos: DetailTodo[];
}

const LEADERSHIP_USERS = sql`(
  select distinct ur."userId"
  from platform."userRoles" ur
  join platform.roles r on r.id = ur."roleId"
  where r."isLeadership"
)`;

export async function getMeetingDetail(
  meetingId: string,
  startsAt: Date,
  now: Date = new Date(),
): Promise<MeetingDetail> {
  const [attendeeRows, inviteRows, answerRows, questions, lastExportAt] =
    await Promise.all([
      db.execute<{
        id: string;
        userId: string | null;
        method: DetailAttendee["method"];
        recordedAt: string;
        name: string | null;
        isOfficer: boolean;
        addedByName: string | null;
      }>(sql`
        select a.id, a."userId", a.method, a."recordedAt", p."preferredName" as name,
          (o."userId" is not null) as "isOfficer",
          ap."preferredName" as "addedByName"
        from platform.attendance a
        left join platform.profile p on p."userId" = a."userId"
        left join ${LEADERSHIP_USERS} o on o."userId" = a."userId"
        left join lateral (
          select e."actorUserId"
          from platform."auditEvents" e
          where e."targetType" = 'attendance' and e."targetId" = a.id::text
            and e.action = 'attendance.recorded'
          order by e."createdAt" limit 1
        ) rec on a.method = 'officer'
        left join platform.profile ap on ap."userId" = rec."actorUserId"
        where a."meetingId" = ${meetingId}::uuid
        order by a."recordedAt", a.id
      `),
      db.execute<{
        id: string;
        ugaEmail: string;
        createdAt: string;
        expiresAt: string;
        claimedAt: string | null;
        createdByName: string | null;
      }>(sql`
        select i.id, i."ugaEmail", i."createdAt", i."expiresAt", i."claimedAt",
          p."preferredName" as "createdByName"
        from platform."attendanceInvites" i
        left join platform.profile p on p."userId" = i."createdBy"
        where i."meetingId" = ${meetingId}::uuid and i."claimedAt" is null
        order by i."createdAt", i.id
      `),
      db.execute<{ userId: string; questionId: string; answer: Answer }>(sql`
        select "userId", "questionId", answer
        from platform."surveyAnswers"
        where "meetingId" = ${meetingId}::uuid
      `),
      questionsFor(db, meetingId),
      lastAttendanceExport(meetingId, startsAt),
    ]);

  const asked = questions.meeting;
  const answersByUser = new Map<string, Map<string, Answer>>();
  const answersByQuestion = new Map<string, Answer[]>();
  for (const row of answerRows) {
    const forUser = answersByUser.get(row.userId) ?? new Map<string, Answer>();
    forUser.set(row.questionId, row.answer);
    answersByUser.set(row.userId, forUser);
    const forQuestion = answersByQuestion.get(row.questionId) ?? [];
    forQuestion.push(row.answer);
    answersByQuestion.set(row.questionId, forQuestion);
  }

  const attendees: DetailAttendee[] = attendeeRows.map((row) => {
    const mine = row.userId ? answersByUser.get(row.userId) : undefined;
    const answers = asked.flatMap((question) => {
      const answer = mine?.get(question.id);
      return answer
        ? [
            {
              prompt: question.prompt,
              answer: describeAnswer(question, answer),
            },
          ]
        : [];
    });
    return {
      id: row.id,
      userId: row.userId,
      name: row.name,
      method: row.method,
      recordedAt: new Date(row.recordedAt),
      isOfficer: row.isOfficer,
      addedBy: row.method === "officer" ? { name: row.addedByName } : null,
      survey: { answered: answers.length, asked: asked.length, answers },
    };
  });

  const counts: AttendanceCount = {
    total: attendees.length,
    officers: attendees.filter((a) => a.isOfficer).length,
  };

  return {
    counts,
    attendees,
    invites: inviteRows.map((row) => {
      const expiresAt = new Date(row.expiresAt);
      return {
        id: row.id,
        ugaEmail: row.ugaEmail,
        createdAt: new Date(row.createdAt),
        expiresAt,
        state: inviteState({ claimedAt: null, expiresAt }, now),
        createdByName: row.createdByName,
      };
    }),
    questions: asked,
    tallies: asked.map((q) =>
      tallyQuestion(q, answersByQuestion.get(q.id) ?? []),
    ),
    lastExportAt,
    todos: await getSyncTodos(meetingId, lastExportAt),
  };
}

/**
 * When this meeting's attendance was last exported (Q12): the newest
 * `attendance` export that named the meeting, or that named no meeting and
 * whose date range covers it.
 */
export async function lastAttendanceExport(
  meetingId: string,
  startsAt: Date,
): Promise<Date | null> {
  const rows = await db.execute<{ at: string | null }>(sql`
    select max("createdAt") as at
    from platform."exportAudit"
    where kind = 'attendance'
      and (
        filters ->> 'meetingId' = ${meetingId}
        or (
          filters ->> 'meetingId' is null
          and (filters ->> 'from' is null
            or (filters ->> 'from')::timestamptz <= ${startsAt.toISOString()}::timestamptz)
          and (filters ->> 'to' is null
            or (filters ->> 'to')::timestamptz >= ${startsAt.toISOString()}::timestamptz)
        )
      )
  `);
  const at = rows[0]?.at;
  return at ? new Date(at) : null;
}

/** The adds and removals made since the last export, netted per person. */
export async function getSyncTodos(
  meetingId: string,
  lastExportAt: Date | null,
): Promise<DetailTodo[]> {
  if (lastExportAt === null) return [];
  const rows = await db.execute<{
    action: string;
    createdAt: string;
    userId: string | null;
  }>(sql`
    select e.action, e."createdAt",
      coalesce(e.metadata ->> 'userId', e."actorUserId"::text) as "userId"
    from platform."auditEvents" e
    where e."targetType" = 'attendance'
      and e.action in ('attendance.recorded', 'attendance.removed')
      and e.metadata ->> 'meetingId' = ${meetingId}
      and e."createdAt" > ${lastExportAt.toISOString()}::timestamptz
  `);
  const changes: AttendanceChange[] = rows.flatMap((row) =>
    row.userId
      ? [
          {
            kind: row.action === "attendance.removed" ? "removed" : "added",
            userId: row.userId,
            at: new Date(row.createdAt),
          } satisfies AttendanceChange,
        ]
      : [],
  );
  const todos = syncTodos(changes, lastExportAt);
  if (todos.length === 0) return [];

  const people = await db.execute<{
    id: string;
    email: string | null;
    name: string | null;
  }>(sql`
    select u.id, u.email, p."preferredName" as name
    from auth.users u
    left join platform.profile p on p."userId" = u.id
    where u.id in (${sql.join(
      todos.map((todo) => sql`${todo.userId}::uuid`),
      sql`, `,
    )})
  `);
  const byId = new Map(people.map((p) => [p.id, p]));
  return todos.map((todo) => ({
    ...todo,
    name: byId.get(todo.userId)?.name ?? null,
    email: byId.get(todo.userId)?.email ?? null,
  }));
}
