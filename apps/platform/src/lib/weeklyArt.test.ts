import type { Semester } from "@devdogsuga/events";
import { describe, expect, it } from "vitest";
import {
  artPlainText,
  artRuns,
  buildSemesterViews,
  semesterText,
  weeksLabel,
} from "./weeklyArt";
import { computeWeeklyStreak, type WeekState } from "./weeklyStreak";

const evening = (day: string) => new Date(`${day}T22:00:00Z`);

const art = {
  lines: ["oo  oo  oo", "(_) (_) (_)"],
  regions: {
    "2026-09-07": [
      [0, 0, 2],
      [1, 0, 3],
    ],
    "2026-09-14": [
      [0, 4, 2],
      [1, 4, 3],
    ],
    "2026-09-21": [
      [0, 8, 2],
      [1, 8, 3],
    ],
  },
} as Semester["art"];

const semester: Semester = {
  id: "fall-2026",
  label: "Fall 2026",
  from: "2026-08-10",
  to: "2026-12-31",
  art,
};

// Meetings in weeks 1 and 3 only; week 2 has none.
const meetings = [
  { startsAt: evening("2026-09-09"), cancelledAt: null },
  { startsAt: evening("2026-09-23"), cancelledAt: null },
];

function views(activity: string[], now: string, sem: Semester = semester) {
  const streak = computeWeeklyStreak({
    meetings: meetings.map((m) => m.startsAt),
    activity: activity.map(evening),
    now: evening(now),
  });
  return buildSemesterViews({
    semesters: [sem],
    meetings,
    streak,
    now: evening(now),
  });
}

describe("semester text", () => {
  it("reads like 'Fall 2026: 8 of 14 weeks'", () => {
    expect(semesterText("Fall 2026", 8, 14)).toBe("Fall 2026: 8 of 14 weeks");
    expect(semesterText("Fall 2026", 1, 1)).toBe("Fall 2026: 1 of 1 week");
    expect(weeksLabel(0)).toBe("0 weeks");
  });
});

describe("buildSemesterViews", () => {
  it("counts lit weeks over the weeks that count, leaving out an unlit frozen week", () => {
    const [view] = views(["2026-09-09"], "2026-10-30");
    expect(view!.weeks.map((w) => w.state)).toEqual<WeekState[]>([
      "lit",
      "no-meeting",
      "dark",
    ]);
    expect(view!.lit).toBe(1);
    expect(view!.total).toBe(2);
    expect(view!.text).toBe("Fall 2026: 1 of 2 weeks");
  });

  it("counts a frozen week that a merged PR lit", () => {
    const [view] = views(
      ["2026-09-09", "2026-09-15", "2026-09-23"],
      "2026-10-30",
    );
    expect(view!.text).toBe("Fall 2026: 3 of 3 weeks");
  });

  it("leaves out a semester that has not begun", () => {
    expect(views([], "2026-09-01")).toEqual([]);
  });

  it("orders semesters newest first and keeps past ones", () => {
    const spring: Semester = {
      id: "spring-2027",
      label: "Spring 2027",
      from: "2027-01-01",
      to: "2027-05-31",
    };
    const spring27 = { startsAt: evening("2027-01-20"), cancelledAt: null };
    const all = [...meetings, spring27];
    const streak = computeWeeklyStreak({
      meetings: all.map((m) => m.startsAt),
      activity: [],
      now: evening("2027-02-01"),
    });
    const result = buildSemesterViews({
      semesters: [semester, spring],
      meetings: all,
      streak,
      now: evening("2027-02-01"),
    });
    expect(result.map((v) => v.id)).toEqual(["spring-2027", "fall-2026"]);
  });

  it("falls back to no art when the weeks no longer match its regions", () => {
    expect(views([], "2026-10-30")[0]!.art).not.toBeNull();
    const [shorter] = views([], "2026-10-30", {
      ...semester,
      art: {
        lines: art!.lines,
        regions: { "2026-09-07": art!.regions["2026-09-07"]! },
      },
    });
    expect(shorter!.art).toBeNull();
  });

  it("has no art for a semester without any", () => {
    const { art: _unused, ...plain } = semester;
    expect(views([], "2026-10-30", plain)[0]!.art).toBeNull();
  });
});

describe("artRuns", () => {
  const weeks = [
    { week: "2026-09-07", state: "lit" as const },
    { week: "2026-09-14", state: "no-meeting" as const },
    { week: "2026-09-21", state: "dark" as const },
  ];

  it("lights, darkens and frosts regions and leaves scenery alone", () => {
    const [top] = artRuns(art!, weeks, "frost");
    expect(top).toEqual([
      { text: "oo", kind: "lit" },
      { text: "  ", kind: "blank" },
      { text: "oo", kind: "frost" },
      { text: "  ", kind: "blank" },
      { text: "oo", kind: "dark" },
    ]);
  });

  it("blanks an empty week when the treatment leaves it out", () => {
    const [top] = artRuns(art!, weeks, "omit");
    expect(top!.map((run) => run.kind)).toEqual(["lit", "blank", "dark"]);
    expect(top!.map((run) => run.text).join("")).toBe("oo      oo");
  });

  it("treats characters outside every region as scenery", () => {
    const scenic = {
      lines: ["* oo"],
      regions: { "2026-09-07": [[0, 2, 2]] },
    } as Semester["art"];
    const [line] = artRuns(
      scenic!,
      [{ week: "2026-09-07", state: "open" }],
      "frost",
    );
    expect(line).toEqual([
      { text: "*", kind: "scenery" },
      { text: " ", kind: "blank" },
      { text: "oo", kind: "open" },
    ]);
  });
});

describe("artPlainText", () => {
  it("keeps lit characters and turns the rest into dots, frost into tildes", () => {
    const text = artPlainText(
      art!,
      [
        { week: "2026-09-07", state: "lit" },
        { week: "2026-09-14", state: "no-meeting" },
        { week: "2026-09-21", state: "dark" },
      ],
      "frost",
    );
    expect(text).toBe("oo  ~~  ..\n(_) ~~~ ...");
  });
});
