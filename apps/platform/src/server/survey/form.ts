import { answerSchema, type Answer, type Question } from "@devdogsuga/events";

/**
 * The survey form's wire format, shared by the form that writes it and the
 * action that reads it. Every field is named after its question's id:
 *
 * - text, longText: `q:<id>`, the text.
 * - choice, scale: `q:<id>`, one option id or number (radios).
 * - multiChoice: `q:<id>`, repeated, one per checked option (checkboxes).
 * - Other: `OTHER` among the values above, its text in `q:<id>:other`.
 *
 * Reading turns those fields into the question's stored `Answer` shape and
 * checks it against the question with events' `answerSchema`, the same rule
 * anything reading answers back uses. A question left blank reads as `null`:
 * no answer, or the member clearing one.
 */

export const OTHER = "__other__";

export const fieldName = (questionId: string) => `q:${questionId}`;
export const otherFieldName = (questionId: string) => `q:${questionId}:other`;

export type ReadAnswer = { answer: Answer | null } | { error: string };

function strings(formData: FormData, name: string): string[] {
  return formData
    .getAll(name)
    .filter((v): v is string => typeof v === "string");
}

export function readAnswer(question: Question, formData: FormData): ReadAnswer {
  const values = strings(formData, fieldName(question.id));
  const other = strings(formData, otherFieldName(question.id))[0]?.trim() ?? "";

  let raw: unknown;
  switch (question.type) {
    case "text":
    case "longText": {
      const text = values[0]?.trim() ?? "";
      if (!text) return { answer: null };
      raw = { text };
      break;
    }
    case "scale": {
      if (!values[0]) return { answer: null };
      raw = { value: Number(values[0]) };
      break;
    }
    case "choice": {
      const picked = values[0];
      if (!picked) return { answer: null };
      if (picked === OTHER) {
        if (!other) return { error: "Say what Other is, or pick a choice." };
        raw = { other };
      } else {
        raw = { option: picked };
      }
      break;
    }
    case "multiChoice": {
      const otherChecked = values.includes(OTHER);
      const options = values.filter((v) => v !== OTHER);
      if (otherChecked && !other) {
        return { error: "Say what Other is, or uncheck it." };
      }
      if (options.length === 0 && !otherChecked) return { answer: null };
      raw = otherChecked ? { options, other } : { options };
      break;
    }
  }

  const parsed = answerSchema(question).safeParse(raw);
  if (parsed.success) return { answer: parsed.data };
  return { error: describeProblem(question) };
}

/** One sentence per question type, rather than zod's wording. */
function describeProblem(question: Question): string {
  switch (question.type) {
    case "text":
    case "longText":
      return question.maxLength
        ? `Keep it under ${question.maxLength} characters.`
        : "That answer is too long.";
    case "scale":
      return `Pick a number from ${question.min} to ${question.max}.`;
    case "choice":
      return "Pick one of the choices.";
    case "multiChoice": {
      const min = Math.max(question.minSelected ?? 1, 1);
      const max = question.maxSelected;
      if (max !== undefined)
        return `Pick ${min === max ? min : `${min} to ${max}`}.`;
      return `Pick at least ${min}.`;
    }
  }
}

/** Whether two stored answers say the same thing (key order aside). */
export function sameAnswer(a: Answer | null, b: Answer | null): boolean {
  if (a === null || b === null) return a === b;
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

function normalize(answer: Answer): unknown {
  return Object.fromEntries(
    Object.entries(answer).sort(([x], [y]) => x.localeCompare(y)),
  );
}
