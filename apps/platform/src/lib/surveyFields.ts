/**
 * The survey form's field names, shared by the form (a client component) and
 * the action that reads it (`server/survey/form.ts`, which documents the
 * format). Kept apart from that reader so the browser bundle never pulls in
 * `@devdogsuga/events` and its config data.
 */

export const OTHER = "__other__";
export const ASKED = "asked";

export const fieldName = (questionId: string) => `q:${questionId}`;
export const otherFieldName = (questionId: string) => `q:${questionId}:other`;
