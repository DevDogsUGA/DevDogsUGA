/**
 * The exports. The first three moved from the platform's `server/export/`
 * with their columns unchanged: anything downstream that read
 * `/export/stars` reads `backstage export stars` the same way. `responses`
 * (the check-in survey's answers) was born here.
 *
 * Each query selects its columns, aliased to the header names, in header
 * order; attendance also selects the names and UGA address the Bevy and
 * Involvement Network formats need (see `formats.ts`), past its columns. Parameters: `$1` from (inclusive), `$2` to (exclusive), `$3`
 * a meeting id; each null when not given.
 */

import { describeAnswer, type Answer, type Question } from "@devdogsuga/events";

export const EXPORT_KINDS = [
  "stars",
  "attendance",
  "reflections",
  "responses",
] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

export interface ExportFilters {
  from?: Date;
  to?: Date;
  /** Attendance only. */
  meetingId?: string;
}

export interface ExportSpec {
  columns: readonly string[];
  sql: string;
  summary: string;
  /** Fills columns SQL cannot, from the row's other fields. */
  transform?: (row: Record<string, unknown>) => Record<string, unknown>;
}

/** The member columns every export leads with. */
const MEMBER = (userId: string) => `
  ${userId} as "user_id",
  p."preferredName" as "preferred_name",
  u."email" as "email",
  (
    select i."identity_data" ->> 'user_name'
    from "auth"."identities" i
    where i."user_id" = ${userId} and i."provider" = 'github'
    limit 1
  ) as "github_login"`;

const MEMBER_COLUMNS = ["user_id", "preferred_name", "email", "github_login"];

const MEMBER_JOINS = (userId: string) => `
left join "platform"."profile" p on p."userId" = ${userId}
left join "auth"."users" u on u."id" = ${userId}`;

/**
 * The survey answers one export reads: every current answer, or for one
 * meeting (`$3`), that meeting's answers plus each attendee's member answers
 * AS THEY STOOD WHEN IT ENDED -- the latest revision at or before its end,
 * else the first after it (a member who answered on the way out), from the
 * append-only `surveyAnswerRevisions`. A member answer cleared by then is
 * left out. `--from`/`--to` filter the unscoped case on when the answer was
 * last changed.
 */
const PICKED_ANSWERS = `
picked as (
  select a."userId", a."questionId", a."meetingId", a.answer,
    a."updatedAt" as "answeredAt"
  from "platform"."surveyAnswers" a
  where $3::uuid is null
    and ($1::timestamptz is null or a."updatedAt" >= $1::timestamptz)
    and ($2::timestamptz is null or a."updatedAt" < $2::timestamptz)

  union all

  select a."userId", a."questionId", a."meetingId", a.answer, a."updatedAt"
  from "platform"."surveyAnswers" a
  where a."meetingId" = $3::uuid

  union all

  select "userId", "questionId", null::uuid, answer, "recordedAt"
  from (
    select distinct on (r."userId", r."questionId")
      r."userId", r."questionId", r.answer, r."recordedAt"
    from "platform"."surveyAnswerRevisions" r
    join "platform"."attendance" att
      on att."userId" = r."userId" and att."meetingId" = $3::uuid
    join "platform"."meetings" ended on ended.id = $3::uuid
    where r."meetingId" is null
    order by r."userId", r."questionId",
      r."recordedAt" > ended."endsAt",
      case when r."recordedAt" <= ended."endsAt" then r."recordedAt" end
        desc nulls last,
      r."recordedAt"
  ) as stood
  where answer is not null
)`;

/**
 * One row per survey answer, worded with the question's current definition
 * (so a relabelled option exports under its new label) beside the stored
 * value, for anything that needs option ids.
 */
const RESPONSES: ExportSpec = {
  summary: "One row per survey answer; --meeting for one meeting's.",
  columns: [
    ...MEMBER_COLUMNS,
    "meeting_slug",
    "meeting_title",
    "question_id",
    "question_scope",
    "question_prompt",
    "answer",
    "answer_value",
    "answered_at",
  ],
  sql: `
with ${PICKED_ANSWERS}
select ${MEMBER('pa."userId"')},
  m."slug" as "meeting_slug",
  case when m.id is not null
    then coalesce(m."nameOverride", 'Meeting') end as "meeting_title",
  q.id as "question_id",
  q.scope as "question_scope",
  q.definition ->> 'prompt' as "question_prompt",
  q.definition as "definition",
  pa.answer as "answer_json",
  pa."answeredAt" as "answered_at"
from picked pa
join "platform"."surveyQuestions" q on q.id = pa."questionId"
left join "platform"."meetings" m on m.id = pa."meetingId"
${MEMBER_JOINS('pa."userId"')}
order by pa."userId", q.scope, q.id, m."startsAt" nulls first`,
  transform: (row) => ({
    ...row,
    answer: describeAnswer(
      row.definition as Question,
      row.answer_json as Answer,
    ),
    answer_value: JSON.stringify(row.answer_json),
  }),
};

export const EXPORTS: Record<ExportKind, ExportSpec> = {
  /**
   * One row per earned star: a credit-eligible meeting attended. A star is a
   * meeting fact and is not attributed to a workshop. (Competition stars are
   * retired along with competitions.)
   */
  stars: {
    summary: "One row per earned meeting star.",
    columns: [
      ...MEMBER_COLUMNS,
      "activity_type",
      "activity_id",
      "activity_starts_at",
      "earned_at",
      "meeting_id",
    ],
    sql: `
select ${MEMBER('ms."userId"')},
  ms."activityType" as "activity_type",
  ms."activityId" as "activity_id",
  ms."startsAt" as "activity_starts_at",
  ms."earnedAt" as "earned_at",
  ms."meetingId" as "meeting_id"
from "platform"."memberStars" ms
${MEMBER_JOINS('ms."userId"')}
where ms."activityType" = 'meeting'
  and ($1::timestamptz is null or ms."startsAt" >= $1::timestamptz)
  and ($2::timestamptz is null or ms."startsAt" < $2::timestamptz)
  and $3::uuid is null
order by ms."startsAt", ms."userId", ms."activityType", ms."activityId"`,
  },

  /**
   * One row per check-in, the raw ledger under the stars: an officer
   * reconciling a night sees every scan (and every imported row, method
   * `import`) rather than a derived boolean.
   */
  attendance: {
    summary: "One row per check-in: who, which meeting, when, and how.",
    columns: [
      ...MEMBER_COLUMNS,
      "meeting_slug",
      "meeting_title",
      "meeting_starts_at",
      "checked_in_at",
      "check_in_method",
      "counts_for_credit",
    ],
    sql: `
select ${MEMBER('a."userId"')},
  m."slug" as "meeting_slug",
  coalesce(m."nameOverride", 'Meeting') as "meeting_title",
  m."startsAt" as "meeting_starts_at",
  a."recordedAt" as "checked_in_at",
  a."method"::text as "check_in_method",
  m."countsForCredit" as "counts_for_credit",
  lower(p."ugaEmail") as "uga_email",
  coalesce(p."involvementFirstName", p."legalFirstName") as "first_name",
  coalesce(p."involvementLastName", p."legalLastName") as "last_name"
from "platform"."attendance" a
join "platform"."meetings" m on m."id" = a."meetingId"
${MEMBER_JOINS('a."userId"')}
where ($1::timestamptz is null or m."startsAt" >= $1::timestamptz)
  and ($2::timestamptz is null or m."startsAt" < $2::timestamptz)
  and ($3::uuid is null or a."meetingId" = $3::uuid)
order by m."startsAt", a."userId", a."id"`,
  },

  /**
   * One row per reflection, carrying the member's current text. The revision
   * history stays in `reflectionRevisions`; this is "what did people write",
   * not "who edited what".
   */
  reflections: {
    summary: "One row per reflection, with the member's current text.",
    columns: [
      ...MEMBER_COLUMNS,
      "activity_type",
      "activity_id",
      "activity_title",
      "content",
      "submitted_at",
      "created_at",
      "updated_at",
      "revision_count",
    ],
    sql: `
select ${MEMBER('r."userId"')},
  'meeting' as "activity_type",
  r."meetingId" as "activity_id",
  (
    select coalesce(m."nameOverride", 'Meeting')
    from "platform"."meetings" m where m."id" = r."meetingId"
  ) as "activity_title",
  r."content" as "content",
  r."submittedAt" as "submitted_at",
  r."createdAt" as "created_at",
  r."updatedAt" as "updated_at",
  (
    select count(*)::int from "platform"."reflectionRevisions" rr
    where rr."reflectionId" = r."id"
  ) as "revision_count"
from "platform"."reflections" r
${MEMBER_JOINS('r."userId"')}
where r."meetingId" is not null
  and ($1::timestamptz is null or r."createdAt" >= $1::timestamptz)
  and ($2::timestamptz is null or r."createdAt" < $2::timestamptz)
  and $3::uuid is null
order by r."createdAt", r."userId", r."id"`,
  },

  responses: RESPONSES,
};

export function exportParams(filters: ExportFilters): (string | null)[] {
  return [
    filters.from?.toISOString() ?? null,
    filters.to?.toISOString() ?? null,
    filters.meetingId ?? null,
  ];
}

/**
 * The filters as the audit row records them, in the platform's shape: an
 * unfiltered export is an explicit `{}`, distinguishable from a slice.
 */
export function auditFilters(filters: ExportFilters): Record<string, string> {
  const out: Record<string, string> = {};
  if (filters.from) out.from = filters.from.toISOString();
  if (filters.to) out.to = filters.to.toISOString();
  if (filters.meetingId) out.meetingId = filters.meetingId;
  return out;
}
