/**
 * The shapes an export can be written in. Every export has the platform's own
 * CSV; attendance can also be written for the two places DevDogs reports an
 * event's attendance to:
 *
 * - `bevy`: GDG's Bevy attendee import (gdg.community.dev, an event's
 *   Registrations, "Import attendees"), its template's fixed columns with
 *   `checked_in` TRUE, then a `survey:` column for each check-in survey
 *   question mapped to one (`bevy` in questions.json) that anyone at the
 *   meeting answered, filled with each person's answer as of the meeting.
 * - `involvement`: the UGA Involvement Network's attendance upload, one MyID
 *   email per line and nothing else.
 *
 * Both are one line per person, not per check-in, and only make sense for one
 * event, so they need `--meeting`.
 *
 * Survey responses can also be written `wide`: one row per person, one
 * column per question, for one meeting.
 */
import { getQuestions } from "@devdogsuga/events";
import type { ExportKind } from "./queries.js";
import { csvRow, LINE_ENDING } from "../csv/write.js";

export const FORMAT_NAMES = [
  "platform",
  "bevy",
  "involvement",
  "wide",
] as const;
export type FormatName = (typeof FORMAT_NAMES)[number];

/** What each export can be written as; the first is its default. */
export const FORMATS_BY_KIND: Record<ExportKind, readonly FormatName[]> = {
  evidence: ["platform"],
  attendance: ["platform", "bevy", "involvement"],
  reflections: ["platform"],
  responses: ["platform", "wide"],
};

/** Survey answers by person, for the Bevy file's `survey:` columns. */
export interface BevySurvey {
  /** The `survey:` columns, in order. */
  columns: string[];
  /** user id → column → the answer in words. */
  byUser: Map<string, Map<string, string>>;
}

export type Row = Record<string, unknown>;

/** Writes one file's rows; a fresh one per file, since it remembers who it wrote. */
export interface FormatWriter {
  /** The text for one page of rows, and how many lines that was. */
  page: (rows: readonly Row[]) => { text: string; count: number };
  /** People left out (no address the format can use). */
  skipped: () => number;
  /** Anything written only once every row is in, such as a wide table. */
  end?: () => { text: string; count: number };
}

export interface Format {
  name: FormatName;
  label: string;
  hint: string;
  /** Added to the default file name, after the filters. */
  suffix: string;
  extension: "csv" | "txt";
  /** Whether the file opens with a UTF-8 byte-order mark (for Excel). */
  bom: boolean;
  /** One event's attendance: needs `--meeting`. */
  perEvent: boolean;
  /** What one line is, for "Wrote 3 …". */
  unit: [one: string, many: string];
  /** What a skipped attendee had no copy of, for the warning. */
  needs: string;
  /** The header line, if any. */
  head: string;
  writer: () => FormatWriter;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** The UGA address on file: the profile's MyID email, else a uga.edu sign-in. */
export function ugaEmail(row: Row): string | null {
  const uga = text(row.uga_email).toLowerCase();
  if (uga) return uga;
  const signIn = text(row.email).toLowerCase();
  return signIn.endsWith("@uga.edu") ? signIn : null;
}

/**
 * First and last name: the roster's (or legal) name when the profile has
 * one, else the preferred name split at its first space.
 */
export function splitName(row: Row): [first: string, last: string] {
  const first = text(row.first_name);
  const last = text(row.last_name);
  if (first || last) return [first, last];
  const preferred = text(row.preferred_name);
  const space = preferred.indexOf(" ");
  return space === -1
    ? [preferred, ""]
    : [preferred.slice(0, space), preferred.slice(space + 1).trim()];
}

/** One line per new key; rows without a key are counted as skipped. */
function oncePer(
  key: (row: Row) => string | null,
  line: (row: Row, key: string) => string,
): FormatWriter {
  const seen = new Set<string>();
  const skipped = new Set<string>();
  return {
    page: (rows) => {
      let out = "";
      let count = 0;
      for (const row of rows) {
        const k = key(row);
        if (k === null) {
          skipped.add(text(row.user_id));
          continue;
        }
        if (seen.has(k)) continue;
        seen.add(k);
        out += line(row, k);
        count++;
      }
      return { text: out, count };
    },
    skipped: () => skipped.size,
  };
}

export const BEVY_COLUMNS = [
  "first_name",
  "last_name",
  "email",
  "checked_in",
  "job_title",
  "company",
  "ticket_title",
  "ticket_venue",
] as const;

/** The platform's CSV for an export: its columns, a row per row. */
export function platformFormat(columns: readonly string[]): Format {
  return {
    name: "platform",
    label: "Platform CSV",
    hint: "every column, one row per record",
    suffix: "",
    extension: "csv",
    bom: true,
    perEvent: false,
    unit: ["row", "rows"],
    needs: "",
    head: csvRow(columns),
    writer: () => ({
      page: (rows) => ({
        text: rows.map((row) => csvRow(columns.map((c) => row[c]))).join(""),
        count: rows.length,
      }),
      skipped: () => 0,
    }),
  };
}

export function bevyFormat(
  survey: BevySurvey = { columns: [], byUser: new Map() },
): Format {
  return {
    name: "bevy",
    label: "Bevy attendee import",
    hint: "gdg.community.dev; one row per person, checked in, survey answers",
    suffix: "bevy",
    extension: "csv",
    bom: false,
    perEvent: true,
    unit: ["person", "people"],
    needs: "an email",
    head: csvRow([...BEVY_COLUMNS, ...survey.columns]),
    writer: () =>
      oncePer(
        (row) => (ugaEmail(row) ?? text(row.email).toLowerCase()) || null,
        (row, email) => {
          const [first, last] = splitName(row);
          const answers = survey.byUser.get(text(row.user_id));
          return csvRow([
            first,
            last,
            email,
            "TRUE",
            "",
            "",
            "",
            "",
            ...survey.columns.map((c) => answers?.get(c) ?? ""),
          ]);
        },
      ),
  };
}

/** `bevy` without survey answers: the template's fixed columns only. */
export const BEVY: Format = bevyFormat();

/**
 * Survey responses as one row per person and one column per question (its
 * id), in the order questions first appear. Every row has to be in before the
 * header is known, so it writes everything at the end; one meeting's answers
 * are what it is for, which keeps that small.
 */
export const WIDE: Format = {
  name: "wide",
  label: "Wide table",
  hint: "one row per person, one column per question",
  suffix: "wide",
  extension: "csv",
  bom: true,
  perEvent: true,
  unit: ["person", "people"],
  needs: "",
  head: "",
  writer: () => {
    const questions: string[] = [];
    const people = new Map<
      string,
      { row: Row; answers: Map<string, unknown> }
    >();
    return {
      page: (rows) => {
        for (const row of rows) {
          const question = text(row.question_id);
          if (!questions.includes(question)) questions.push(question);
          const id = text(row.user_id);
          const person = people.get(id) ?? { row, answers: new Map() };
          person.answers.set(question, row.answer);
          people.set(id, person);
        }
        return { text: "", count: 0 };
      },
      skipped: () => 0,
      end: () => {
        const lead = ["user_id", "preferred_name", "email"];
        let out = csvRow([...lead, ...questions]);
        for (const { row, answers } of people.values()) {
          out += csvRow([
            ...lead.map((c) => row[c]),
            ...questions.map((q) => answers.get(q) ?? ""),
          ]);
        }
        return { text: out, count: people.size };
      },
    };
  },
};

export const INVOLVEMENT: Format = {
  name: "involvement",
  label: "Involvement Network list",
  hint: "one MyID email per line",
  suffix: "involvement",
  extension: "txt",
  bom: false,
  perEvent: true,
  unit: ["email", "emails"],
  needs: "a UGA email",
  head: "",
  writer: () => oncePer(ugaEmail, (_row, email) => `${email}${LINE_ENDING}`),
};

export function formatFor(
  name: FormatName,
  columns: readonly string[],
  survey?: BevySurvey,
): Format {
  if (name === "bevy") return bevyFormat(survey);
  if (name === "involvement") return INVOLVEMENT;
  if (name === "wide") return WIDE;
  return platformFormat(columns);
}

/**
 * `--format` values for an export, comma-separated or repeated, checked
 * against what that export offers and deduplicated.
 */
export function parseFormats(
  raw: readonly string[],
  kind: ExportKind,
): FormatName[] {
  const offered = FORMATS_BY_KIND[kind];
  const names = raw
    .flatMap((r) => r.split(","))
    .map((r) => r.trim().toLowerCase())
    .filter(Boolean);
  for (const name of names) {
    if (!(offered as readonly string[]).includes(name)) {
      throw new Error(
        offered.length === 1
          ? `The ${kind} export has one format; leave --format off.`
          : `Unknown format "${name}" for ${kind}. Try ${offered.join(", ")}.`,
      );
    }
  }
  return [...new Set(names)] as FormatName[];
}

/** The `survey:` columns Bevy's registration form requires, which are the
 * questions.json questions marked `required` that are still asked. */
export function bevyRequiredColumns(): string[] {
  return getQuestions().questions.flatMap((q) =>
    q.required && !q.retired && q.bevy ? [q.bevy] : [],
  );
}

/**
 * The Bevy file's survey columns from a meeting's `responses` rows: each
 * mapped question anyone answered, and each person's answer in words.
 *
 * Bevy rejects a row that answers some survey questions but leaves out one
 * its form requires, while a row with no answers at all imports. So someone
 * missing any of the `required` columns gets none of their answers written.
 */
export function bevySurvey(
  rows: readonly Row[],
  required: readonly string[] = [],
): BevySurvey {
  const columns: string[] = [];
  const byUser = new Map<string, Map<string, string>>();
  for (const row of rows) {
    const column = (row.definition as { bevy?: string } | null)?.bevy;
    if (!column) continue;
    if (!columns.includes(column)) columns.push(column);
    const id = text(row.user_id);
    const answers = byUser.get(id) ?? new Map<string, string>();
    answers.set(column, text(row.answer));
    byUser.set(id, answers);
  }
  for (const [id, answers] of byUser) {
    if (required.some((column) => !answers.get(column))) byUser.delete(id);
  }
  return { columns: columns.sort(), byUser };
}
