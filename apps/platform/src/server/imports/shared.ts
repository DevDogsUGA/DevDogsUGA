import type { ImportPreview, InvalidRow, SampleList } from "~/lib/imports";
import { MAX_LISTED_ROWS } from "~/lib/imports";

const SAMPLE_SIZE = 25;

/** The first few of a long list, for the preview; the count says the rest. */
export function sample(heading: string, all: readonly string[]): SampleList[] {
  if (all.length === 0) return [];
  return [
    {
      heading,
      items: all.slice(0, SAMPLE_SIZE),
      more: Math.max(0, all.length - SAMPLE_SIZE),
    },
  ];
}

export function capInvalid(invalid: InvalidRow[]): {
  invalid: InvalidRow[];
  invalidMore: number;
} {
  const sorted = [...invalid].sort(
    (a, b) => (a.line ?? 0) - (b.line ?? 0) || a.value.localeCompare(b.value),
  );
  return {
    invalid: sorted.slice(0, MAX_LISTED_ROWS),
    invalidMore: Math.max(0, sorted.length - MAX_LISTED_ROWS),
  };
}

/** The most audit metadata keeps of an uploaded file's name. */
export function auditFileName(name: string): string {
  return name.replace(/[\r\n]/g, " ").slice(0, 120);
}

export const who = (a: { email: string; name: string | null }) =>
  a.name ? `${a.name} <${a.email}>` : a.email;

export type Analysis<Plan> = {
  preview: ImportPreview;
  /** What `apply` needs; never leaves the server. */
  plan: Plan;
};
