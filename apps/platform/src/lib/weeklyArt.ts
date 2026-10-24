import {
  clubWeekStart,
  semesterWeeks,
  type EmptyWeekTreatment,
  type Semester,
  type SemesterArt,
  type SemesterMeeting,
} from "@devdogsuga/events";
import type { WeekState, WeeklyStreak } from "./weeklyStreak";

/**
 * The view model behind the weekly art (Q173-Q176): one picture per semester,
 * from its first meeting's week to its last, each week lit or not.
 */

export interface SemesterWeek {
  /** The week's Monday, `YYYY-MM-DD`. */
  week: string;
  state: WeekState;
}

export interface SemesterView {
  id: string;
  label: string;
  weeks: SemesterWeek[];
  /** Weeks that qualified. */
  lit: number;
  /** Weeks that count: every week except a frozen one nobody lit. */
  total: number;
  /** "Fall 2026: 8 of 14 weeks", the picture's text equivalent. */
  text: string;
  /** The picture, or null when the semester has none or it no longer fits its weeks. */
  art: SemesterArt | null;
}

/** "1 week", "3 weeks". */
export function weeksLabel(count: number): string {
  return `${count} ${count === 1 ? "week" : "weeks"}`;
}

export function semesterText(label: string, lit: number, total: number) {
  return `${label}: ${lit} of ${weeksLabel(total)}`;
}

/**
 * The semesters that have begun, newest first, each with its weeks' states.
 * A semester with no live meeting has no weeks and is left out.
 */
export function buildSemesterViews(input: {
  semesters: readonly Semester[];
  meetings: readonly SemesterMeeting[];
  streak: WeeklyStreak;
  now: Date;
}): SemesterView[] {
  const currentWeek = clubWeekStart(input.now);
  const views: SemesterView[] = [];
  for (const semester of input.semesters) {
    const weeks = semesterWeeks(semester, input.meetings);
    if (weeks.length === 0 || weeks[0]! > currentWeek) continue;
    const cells = weeks.map((week) => ({
      week,
      state: input.streak.stateOf(week),
    }));
    const lit = cells.filter((c) => c.state === "lit").length;
    const total = cells.filter((c) => c.state !== "no-meeting").length;
    views.push({
      id: semester.id,
      label: semester.label,
      weeks: cells,
      lit,
      total,
      text: semesterText(semester.label, lit, total),
      art: artFitting(semester.art, weeks),
    });
  }
  return views.sort((a, b) => (a.weeks[0]!.week < b.weeks[0]!.week ? 1 : -1));
}

/**
 * The art only when it has a region for exactly these weeks. The events check
 * keeps config and art in step; this guards a meeting added or cancelled in
 * the database since, which would otherwise leave a week with nowhere to light.
 */
function artFitting(
  art: SemesterArt | undefined,
  weeks: readonly string[],
): SemesterArt | null {
  if (!art) return null;
  const mapped = Object.keys(art.regions).sort();
  return mapped.length === weeks.length &&
    mapped.every((w, i) => w === weeks[i])
    ? art
    : null;
}

export type ArtKind = "scenery" | "lit" | "dark" | "open" | "frost" | "blank";

export interface ArtRun {
  text: string;
  kind: ArtKind;
}

/**
 * The picture as runs of same-looking characters, one array per line. A week
 * that is `no-meeting` is drawn as frost, or becomes blank when the treatment
 * leaves empty weeks out.
 */
export function artRuns(
  art: SemesterArt,
  weeks: readonly SemesterWeek[],
  treatment: EmptyWeekTreatment,
): ArtRun[][] {
  const stateOf = new Map(weeks.map((w) => [w.week, w.state]));
  const owner = new Map<string, string>();
  for (const [week, spans] of Object.entries(art.regions)) {
    for (const [line, column, length] of spans) {
      for (let c = column; c < column + length; c += 1) {
        owner.set(`${line}:${c}`, week);
      }
    }
  }

  return art.lines.map((text, line) => {
    const runs: ArtRun[] = [];
    for (let c = 0; c < text.length; c += 1) {
      const char = text[c]!;
      const week = owner.get(`${line}:${c}`);
      let kind: ArtKind;
      if (char === " ") kind = "blank";
      else if (week === undefined) kind = "scenery";
      else {
        const state = stateOf.get(week) ?? "no-meeting";
        if (state === "no-meeting")
          kind = treatment === "omit" ? "blank" : "frost";
        else kind = state;
      }
      const shown = kind === "blank" ? " " : char;
      const last = runs.at(-1);
      if (last?.kind === kind) last.text += shown;
      else runs.push({ text: shown, kind });
    }
    return runs;
  });
}

/** The picture as plain text for a terminal: lit characters stay, the rest are dots. */
export function artPlainText(
  art: SemesterArt,
  weeks: readonly SemesterWeek[],
  treatment: EmptyWeekTreatment,
): string {
  return artRuns(art, weeks, treatment)
    .map((runs) =>
      runs
        .map((run) => {
          if (run.kind === "lit" || run.kind === "blank") return run.text;
          if (run.kind === "scenery") return run.text;
          if (run.kind === "frost") return run.text.replace(/\S/g, "~");
          return run.text.replace(/\S/g, ".");
        })
        .join("")
        .trimEnd(),
    )
    .join("\n");
}
