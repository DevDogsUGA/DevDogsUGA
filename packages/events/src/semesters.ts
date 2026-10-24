import { z } from "zod";
import { SERIES_ID_PATTERN } from "./schema.js";
import {
  clubDateKey,
  clubWeekStart,
  isDateKey,
  isMonday,
  weekRange,
} from "./weeks.js";

/**
 * Semesters and the weekly art, authored in `semesters.json`.
 *
 * A semester is a date window plus a label; its weeks run from the week of its
 * first meeting to the week of its last (cancelled meetings do not count). Each
 * semester may carry hand-drawn ASCII art: `lines` is the picture, and
 * `regions` says which characters belong to which week, so a week that
 * qualifies for the streak lights its region (Q173-Q176). A semester without
 * art renders a plain row of week cells.
 */

/** The longest label a semester heading carries ("Fall 2026"). */
export const SEMESTER_LABEL_MAX_LENGTH = 40;

/** The tallest and widest a picture may be: it has to fit a phone's card. */
export const ART_MAX_LINES = 40;
export const ART_MAX_COLUMNS = 64;

/**
 * What a week with no meetings (and no merged pull request) looks like.
 * `frost` draws its region in a style that is neither lit nor dark; `omit`
 * leaves the region out of the picture entirely.
 */
export const EMPTY_WEEK_TREATMENTS = ["frost", "omit"] as const;

export type EmptyWeekTreatment = (typeof EMPTY_WEEK_TREATMENTS)[number];

const dateKey = z.string().refine(isDateKey, "must be a real YYYY-MM-DD date");

/** One run of characters: [line, first column, length], all zero-based. */
export const artSpanSchema = z.tuple([
  z.number().int().min(0),
  z.number().int().min(0),
  z.number().int().min(1),
]);

export type ArtSpan = z.infer<typeof artSpanSchema>;

export const semesterArtSchema = z.strictObject({
  lines: z
    .array(z.string().max(ART_MAX_COLUMNS))
    .min(1)
    .max(ART_MAX_LINES)
    .meta({
      description:
        "The picture, one string per line. Characters outside every region are scenery and never change.",
    }),
  regions: z.record(dateKey, z.array(artSpanSchema).min(1)).meta({
    description:
      "Week (its Monday) to the runs of characters that week lights, as [line, column, length].",
  }),
});

export type SemesterArt = z.infer<typeof semesterArtSchema>;

export const semesterSchema = z.strictObject({
  id: z.string().regex(SERIES_ID_PATTERN).meta({
    description: 'The semester\'s identity, for example "fall-2026".',
  }),
  label: z.string().min(1).max(SEMESTER_LABEL_MAX_LENGTH).meta({
    description: 'What the heading and the text equivalent say ("Fall 2026").',
  }),
  from: dateKey.meta({
    description:
      "First day of the window meetings are assigned to this semester by.",
  }),
  to: dateKey.meta({ description: "Last day of that window." }),
  art: semesterArtSchema.optional().meta({
    description:
      "The weekly picture. Leave it out and the semester shows a plain row of week cells.",
  }),
});

export type Semester = z.infer<typeof semesterSchema>;

export const semestersConfigSchema = z.strictObject({
  /** The editor's pointer to `semesters.schema.json`; ignored otherwise. */
  $schema: z.string().optional(),
  emptyWeeks: z.enum(EMPTY_WEEK_TREATMENTS).meta({
    description:
      "The one switch for weeks with no meetings: frost (neither lit nor dark) or omit (left out of the picture).",
  }),
  semesters: z.array(semesterSchema),
});

export type SemestersConfig = z.infer<typeof semestersConfigSchema>;

/** The meeting facts the weeks derive from. */
export interface SemesterMeeting {
  startsAt: Date | string;
  cancelledAt?: Date | string | null;
}

function startOf(meeting: SemesterMeeting): Date {
  return meeting.startsAt instanceof Date
    ? meeting.startsAt
    : new Date(meeting.startsAt);
}

/**
 * The semester's weeks: every Monday from the week of its first live meeting
 * to the week of its last, so a gap week inside the term is still there.
 * Empty when no live meeting falls in the window.
 */
export function semesterWeeks(
  semester: Pick<Semester, "from" | "to">,
  meetings: readonly SemesterMeeting[],
): string[] {
  const weeks = meetings
    .filter((meeting) => !meeting.cancelledAt)
    .map((meeting) => startOf(meeting))
    .filter((at) => {
      const day = clubDateKey(at);
      return day >= semester.from && day <= semester.to;
    })
    .map((at) => clubWeekStart(at))
    .sort();
  if (weeks.length === 0) return [];
  return weekRange(weeks[0]!, weeks[weeks.length - 1]!);
}

export interface SemesterIssue {
  id: string;
  message: string;
}

/** What `semesters.json` cannot say in its shape alone. */
export function validateSemesters(
  config: SemestersConfig,
  meetings: readonly SemesterMeeting[],
): SemesterIssue[] {
  const issues: SemesterIssue[] = [];
  const seen = new Set<string>();
  const sorted = [...config.semesters].sort((a, b) =>
    a.from < b.from ? -1 : a.from > b.from ? 1 : 0,
  );
  for (const semester of config.semesters) {
    if (seen.has(semester.id)) {
      issues.push({ id: semester.id, message: "Semester id is used twice." });
    }
    seen.add(semester.id);
    if (semester.to < semester.from) {
      issues.push({
        id: semester.id,
        message: "The window ends before it begins.",
      });
    }
  }
  sorted.forEach((semester, index) => {
    const next = sorted[index + 1];
    if (next && next.from <= semester.to) {
      issues.push({
        id: next.id,
        message: `Its window overlaps ${semester.id}'s, so a meeting could belong to both.`,
      });
    }
  });
  for (const semester of config.semesters) {
    if (semester.art) {
      issues.push(...validateArt(semester, semester.art, meetings));
    }
  }
  return issues;
}

function validateArt(
  semester: Semester,
  art: SemesterArt,
  meetings: readonly SemesterMeeting[],
): SemesterIssue[] {
  const issues: SemesterIssue[] = [];
  const problem = (message: string) =>
    issues.push({ id: semester.id, message: `Art: ${message}` });

  const expected = semesterWeeks(semester, meetings);
  const mapped = Object.keys(art.regions).sort();
  for (const week of mapped) {
    if (!isMonday(week)) problem(`${week} is not a Monday.`);
  }
  const missing = expected.filter((week) => !(week in art.regions));
  const extra = mapped.filter((week) => !expected.includes(week));
  if (missing.length > 0) {
    problem(`no region for week ${missing.join(", ")}.`);
  }
  if (extra.length > 0 && expected.length > 0) {
    problem(
      `region for ${extra.join(", ")}, which is outside the semester's meeting weeks.`,
    );
  }

  const owner = new Map<string, string>();
  for (const week of mapped) {
    for (const [line, column, length] of art.regions[week] ?? []) {
      const text = art.lines[line];
      if (text === undefined) {
        problem(`week ${week} names line ${line}, which does not exist.`);
        continue;
      }
      if (column + length > text.length) {
        problem(`week ${week} runs past the end of line ${line}.`);
        continue;
      }
      for (let c = column; c < column + length; c += 1) {
        if (text[c] === " ") {
          problem(
            `week ${week} covers a blank at line ${line}, column ${c}; a region marks drawn characters.`,
          );
          break;
        }
        const cell = `${line}:${c}`;
        const other = owner.get(cell);
        if (other !== undefined && other !== week) {
          problem(
            `weeks ${other} and ${week} both claim line ${line}, column ${c}.`,
          );
          break;
        }
        owner.set(cell, week);
      }
    }
  }
  return issues;
}

/** Parses and validates a semesters file, throwing a readable error. */
export function parseSemesters(
  raw: unknown,
  meetings: readonly SemesterMeeting[],
): SemestersConfig {
  const parsed = semestersConfigSchema.parse(raw);
  const issues = validateSemesters(parsed, meetings);
  if (issues.length > 0) {
    throw new Error(
      `semesters.json: ${issues.map((i) => `[${i.id}] ${i.message}`).join(" ")}`,
    );
  }
  return parsed;
}
