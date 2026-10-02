"use server";

import type { Answer, Question } from "@devdogsuga/events";
import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { expectSession } from "~/server/auth";
import { db } from "~/server/db";
import { auditEvents, surveyAnswerRevisions } from "~/server/db/schema";
import { reflectionDeadline } from "~/server/reflections/policy";
import { readAnswer, sameAnswer } from "~/server/survey/form";
import {
  attendedMeeting,
  questionsFor,
  submissionWindowDays,
} from "~/server/survey/load";

export interface SurveyActionState {
  ok: boolean;
  message: string;
  /** Per question id, what to fix. */
  errors?: Record<string, string>;
}

const inputSchema = z.object({ meetingId: z.uuid() });

/**
 * Saves a member's check-in survey for one meeting they attended: every
 * member question and this meeting's own, answered, changed or cleared at
 * once. Only answers that changed are written, each with a revision, under
 * one `survey.saved` audit event naming the questions. A required question
 * left blank, or an answer the question does not allow, saves nothing and
 * says which.
 *
 * Meeting questions are answerable through the meeting's reflection window;
 * member questions always. Nothing here touches attendance.
 */
export async function saveSurvey(
  _previous: SurveyActionState,
  formData: FormData,
): Promise<SurveyActionState> {
  const parsed = inputSchema.safeParse({
    meetingId: formData.get("meetingId"),
  });
  if (!parsed.success) return { ok: false, message: "That survey is invalid." };

  const userId = await expectSession();
  try {
    const changed = await writeSurvey(userId, parsed.data.meetingId, formData);
    revalidatePath("/attendance");
    return {
      ok: true,
      message: changed === 0 ? "Nothing changed." : "Answers saved.",
    };
  } catch (error) {
    if (error instanceof SurveyError) {
      return { ok: false, message: error.message, errors: error.errors };
    }
    return {
      ok: false,
      message: "Your answers could not be saved. Try again.",
    };
  }
}

class SurveyError extends Error {
  constructor(
    message: string,
    readonly errors?: Record<string, string>,
  ) {
    super(message);
  }
}

interface Pending {
  question: Question;
  meetingId: string | null;
  answer: Answer | null;
}

async function writeSurvey(
  userId: string,
  meetingId: string,
  formData: FormData,
): Promise<number> {
  return db.transaction(async (tx) => {
    const meeting = await attendedMeeting(tx, userId, meetingId);
    if (!meeting) {
      throw new SurveyError("Check in to this meeting to answer its survey.");
    }
    const questions = await questionsFor(tx, meetingId);
    const meetingOpen =
      new Date() <=
      reflectionDeadline(meeting.endsAt, await submissionWindowDays(tx));

    const errors: Record<string, string> = {};
    const pending: Pending[] = [];
    const read = (question: Question, scopeMeetingId: string | null) => {
      const result = readAnswer(question, formData);
      if ("error" in result) errors[question.id] = result.error;
      else if (result.answer === null && question.required) {
        errors[question.id] = "Answer this question.";
      } else {
        pending.push({
          question,
          meetingId: scopeMeetingId,
          answer: result.answer,
        });
      }
    };
    for (const question of questions.member) read(question, null);
    // A closed meeting's questions are shown read-only and not submitted.
    if (meetingOpen)
      for (const question of questions.meeting) read(question, meetingId);

    if (Object.keys(errors).length > 0) {
      throw new SurveyError("Check the highlighted answers.", errors);
    }

    const existingRows = await tx.execute<{
      id: string;
      questionId: string;
      meetingId: string | null;
      answer: Answer;
    }>(sql`
      select id, "questionId", "meetingId", answer
      from platform."surveyAnswers"
      where "userId" = ${userId}::uuid
        and ("meetingId" is null or "meetingId" = ${meetingId}::uuid)
      for update
    `);
    const key = (questionId: string, scope: string | null) =>
      `${questionId}:${scope ?? ""}`;
    const existing = new Map(
      existingRows.map((row) => [key(row.questionId, row.meetingId), row]),
    );

    const revisionIds: string[] = [];
    const changedIds: string[] = [];
    for (const item of pending) {
      const current = existing.get(key(item.question.id, item.meetingId));
      if (sameAnswer(current?.answer ?? null, item.answer)) continue;

      if (item.answer === null) {
        await tx.execute(
          sql`delete from platform."surveyAnswers" where id = ${current!.id}::uuid`,
        );
      } else if (current) {
        await tx.execute(sql`
          update platform."surveyAnswers"
          set answer = ${JSON.stringify(item.answer)}::jsonb, "updatedAt" = now()
          where id = ${current.id}::uuid
        `);
      } else {
        await tx.execute(sql`
          insert into platform."surveyAnswers" ("userId", "questionId", "meetingId", answer)
          values (${userId}::uuid, ${item.question.id}, ${item.meetingId}::uuid,
            ${JSON.stringify(item.answer)}::jsonb)
        `);
      }
      const [revision] = await tx
        .insert(surveyAnswerRevisions)
        .values({
          userId,
          questionId: item.question.id,
          meetingId: item.meetingId,
          answer: item.answer,
        })
        .returning({ id: surveyAnswerRevisions.id });
      revisionIds.push(revision!.id);
      changedIds.push(item.question.id);
    }

    if (changedIds.length > 0) {
      await tx.insert(auditEvents).values({
        actorType: "user",
        actorUserId: userId,
        source: "platform",
        action: "survey.saved",
        targetType: "meeting",
        targetId: meetingId,
        metadata: { questionIds: changedIds, revisionIds },
      });
    }
    return changedIds.length;
  });
}
