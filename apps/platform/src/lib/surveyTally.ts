import type { Answer, Question } from "@devdogsuga/events";

/**
 * A per-meeting tally of one survey question's answers, for the officers'
 * meeting page. Choices and scales count each option or value (including ones
 * nobody picked, so the shape of the question stays visible); free text has no
 * buckets, only a response count.
 */
export interface QuestionTally {
  questionId: string;
  prompt: string;
  /** How many attendees answered it. */
  responses: number;
  /** Null for free-text questions. */
  buckets: { label: string; count: number }[] | null;
}

export function tallyQuestion(
  question: Question,
  answers: readonly Answer[],
): QuestionTally {
  const base = {
    questionId: question.id,
    prompt: question.prompt,
    responses: answers.length,
  };

  switch (question.type) {
    case "text":
    case "longText":
      return { ...base, buckets: null };
    case "scale": {
      const buckets: { label: string; count: number }[] = [];
      for (let value = question.min; value <= question.max; value += 1) {
        buckets.push({
          label: String(value),
          count: answers.filter((a) => "value" in a && a.value === value)
            .length,
        });
      }
      return { ...base, buckets };
    }
    case "choice":
    case "multiChoice": {
      const counts = new Map<string, number>(
        question.options.map((o) => [o.id, 0]),
      );
      let other = 0;
      for (const answer of answers) {
        if ("option" in answer) {
          counts.set(answer.option, (counts.get(answer.option) ?? 0) + 1);
        } else if ("options" in answer) {
          for (const id of answer.options) {
            counts.set(id, (counts.get(id) ?? 0) + 1);
          }
          if (answer.other) other += 1;
        } else if ("other" in answer) {
          other += 1;
        }
      }
      const buckets = [...counts].map(([id, count]) => ({
        label: question.options.find((o) => o.id === id)?.label ?? id,
        count,
      }));
      if (question.other || other > 0)
        buckets.push({ label: "Other", count: other });
      return { ...base, buckets };
    }
  }
}
