import { describe, expect, it } from "vitest";
import { computeWeeklyStreak, type WeekState } from "./weeklyStreak";

// Athens evenings (18:00 EDT = 22:00Z, 18:00 EST = 23:00Z).
const evening = (day: string) => new Date(`${day}T22:00:00Z`);
const NOW = evening("2026-10-30");

function run(
  meetings: string[],
  activity: string[],
  now: Date = NOW,
  extraMeetingInstants: Date[] = [],
) {
  return computeWeeklyStreak({
    meetings: [...meetings.map(evening), ...extraMeetingInstants],
    activity: activity.map(evening),
    now,
  });
}

const states = (s: ReturnType<typeof run>, weeks: string[]): WeekState[] =>
  weeks.map((w) => s.stateOf(w));

// Mondays: Sep 7, 14, 21, 28, Oct 5, 12, 19, 26.
const MEETINGS = [
  "2026-09-09",
  "2026-09-16",
  "2026-09-23",
  "2026-09-30",
  "2026-10-07",
  "2026-10-14",
  "2026-10-21",
  "2026-10-28",
];
const WEEKS = [
  "2026-09-07",
  "2026-09-14",
  "2026-09-21",
  "2026-09-28",
  "2026-10-05",
  "2026-10-12",
  "2026-10-19",
  "2026-10-26",
];

describe("weekly streak", () => {
  it("lights each week with workshop activity and counts the run", () => {
    const s = run(MEETINGS, MEETINGS);
    expect(states(s, WEEKS)).toEqual(Array(8).fill("lit"));
    expect(s.current).toBe(8);
    expect(s.longest).toBe(8);
  });

  it("breaks the streak on a closed week with meetings and no activity", () => {
    const activity = MEETINGS.filter((d) => d !== "2026-09-23");
    const s = run(MEETINGS, activity);
    expect(s.stateOf("2026-09-21")).toBe("dark");
    expect(s.longest).toBe(5);
    expect(s.current).toBe(5);
  });

  it("does not let a still-open week break or extend the streak", () => {
    const s = run(MEETINGS, MEETINGS.slice(0, 7), evening("2026-10-27"));
    // Week of Oct 26 is open (today is its Tuesday), the 7 before it are lit.
    expect(s.stateOf("2026-10-26")).toBe("open");
    expect(s.current).toBe(7);
  });

  it("counts a commit on its own as a lit week (commit-only)", () => {
    const s = run(
      ["2026-09-09", "2026-09-16"],
      ["2026-09-08"],
      evening("2026-10-30"),
    );
    expect(s.stateOf("2026-09-07")).toBe("lit");
    expect(s.stateOf("2026-09-14")).toBe("dark");
    expect(s.longest).toBe(1);
  });

  it("does not count attending a non-workshop meeting: only passed activity does", () => {
    // The loader never passes plain-meeting attendance as activity; the week
    // has a meeting but no activity, so it is dark.
    const s = run(["2026-09-09"], []);
    expect(s.stateOf("2026-09-07")).toBe("dark");
    expect(s.current).toBe(0);
  });

  describe("Streak Freeze", () => {
    const withGap = ["2026-09-09", "2026-09-16", "2026-10-07", "2026-10-14"];

    it("neither breaks nor extends a streak across a week without meetings", () => {
      const s = run(withGap, withGap);
      expect(s.stateOf("2026-09-21")).toBe("no-meeting");
      expect(s.stateOf("2026-09-28")).toBe("no-meeting");
      expect(s.current).toBe(4);
      expect(s.longest).toBe(4);
    });

    it("keeps a streak alive through a gap when the member then misses nothing", () => {
      const s = run(withGap, ["2026-09-09", "2026-09-16", "2026-10-07"]);
      expect(s.stateOf("2026-10-12")).toBe("dark");
      expect(s.current).toBe(0);
      expect(s.longest).toBe(3);
    });

    it("lights a no-meeting week that has a commit, and counts it", () => {
      const s = run(withGap, [...withGap, "2026-09-22"]);
      expect(s.stateOf("2026-09-21")).toBe("lit");
      expect(s.stateOf("2026-09-28")).toBe("no-meeting");
      expect(s.current).toBe(5);
    });

    it("is not a gap for weeks before any meeting or after the last one", () => {
      const s = run(["2026-09-09"], ["2026-09-09"], evening("2026-12-01"));
      expect(s.stateOf("2026-08-03")).toBe("no-meeting");
      expect(s.stateOf("2026-11-23")).toBe("no-meeting");
      expect(s.current).toBe(1);
    });
  });

  describe("grace Monday", () => {
    // A meeting week with no activity until the next Monday.
    const meetings = ["2026-09-09", "2026-09-16"];

    it("rescues the previous week from Monday activity", () => {
      // A commit on Mon Sep 14, 12:00 Athens, rescues Sep 7's week.
      const committed = new Date("2026-09-14T16:00:00Z");
      const s = computeWeeklyStreak({
        meetings: meetings.map(evening),
        activity: [committed],
        now: evening("2026-10-30"),
      });
      expect(s.stateOf("2026-09-07")).toBe("lit");
      // The same commit was spent on the rescue, so the new week is not lit by it.
      expect(s.stateOf("2026-09-14")).toBe("dark");
    });

    it("counts Monday activity toward the new week when the old week stood on its own", () => {
      const s = computeWeeklyStreak({
        meetings: meetings.map(evening),
        activity: [evening("2026-09-09"), new Date("2026-09-14T16:00:00Z")],
        now: evening("2026-10-30"),
      });
      expect(s.stateOf("2026-09-07")).toBe("lit");
      expect(s.stateOf("2026-09-14")).toBe("lit");
    });

    it("rescues with one activity, leaving a second for the new week", () => {
      const s = computeWeeklyStreak({
        meetings: meetings.map(evening),
        activity: [
          new Date("2026-09-14T14:00:00Z"),
          new Date("2026-09-14T22:00:00Z"),
        ],
        now: evening("2026-10-30"),
      });
      expect(states(s, ["2026-09-07", "2026-09-14"])).toEqual(["lit", "lit"]);
    });

    it("keeps the previous week open until the grace Monday ends", () => {
      const onMonday = new Date("2026-09-15T03:30:00Z"); // Mon 23:30 Athens
      const s = computeWeeklyStreak({
        meetings: [evening("2026-09-09")],
        activity: [],
        now: onMonday,
      });
      expect(s.stateOf("2026-09-07")).toBe("open");
      expect(s.current).toBe(0);
      const tuesday = new Date("2026-09-15T04:30:00Z"); // Tue 00:30 Athens
      expect(
        computeWeeklyStreak({
          meetings: [evening("2026-09-09")],
          activity: [],
          now: tuesday,
        }).stateOf("2026-09-07"),
      ).toBe("dark");
    });

    it("does not rescue a week that had no meetings", () => {
      const s = computeWeeklyStreak({
        meetings: [evening("2026-09-16")],
        activity: [new Date("2026-09-14T16:00:00Z")],
        now: evening("2026-10-30"),
      });
      expect(s.stateOf("2026-09-07")).toBe("no-meeting");
      expect(s.stateOf("2026-09-14")).toBe("lit");
    });
  });

  describe("Athens-time edges", () => {
    it("files Sunday 23:59 in the old week and Monday 00:00 in the new", () => {
      // EST: Sunday 23:59 = Monday 04:59Z.
      const sunday = new Date("2026-11-09T04:59:00Z");
      const monday = new Date("2026-11-09T05:00:00Z");
      const meetings = [evening("2026-11-04"), evening("2026-11-11")];
      const a = computeWeeklyStreak({
        meetings,
        activity: [sunday],
        now: evening("2026-12-20"),
      });
      expect(a.stateOf("2026-11-02")).toBe("lit");
      expect(a.stateOf("2026-11-09")).toBe("dark");
      const b = computeWeeklyStreak({
        meetings,
        activity: [monday],
        now: evening("2026-12-20"),
      });
      // Monday 00:00 is the grace day for the week before, which it rescues.
      expect(b.stateOf("2026-11-02")).toBe("lit");
      expect(b.stateOf("2026-11-09")).toBe("dark");
    });

    it("handles the 25-hour fall-back day (Nov 1) inside its week", () => {
      const meetings = [evening("2026-10-28")];
      const lateSunday = new Date("2026-11-02T04:59:00Z"); // Sun Nov 1 23:59 EST
      const s = computeWeeklyStreak({
        meetings,
        activity: [lateSunday],
        now: evening("2026-12-20"),
      });
      expect(s.stateOf("2026-10-26")).toBe("lit");
    });

    it("handles the 23-hour spring-forward day (Mar 14, 2027) inside its week", () => {
      const meetings = [evening("2027-03-10")];
      const lateSunday = new Date("2027-03-15T03:59:00Z"); // Sun Mar 14 23:59 EDT
      const s = computeWeeklyStreak({
        meetings,
        activity: [lateSunday],
        now: evening("2027-04-20"),
      });
      expect(s.stateOf("2027-03-08")).toBe("lit");
      const mondayJustAfter = new Date("2027-03-15T04:00:00Z");
      const t = computeWeeklyStreak({
        meetings,
        activity: [mondayJustAfter],
        now: evening("2027-04-20"),
      });
      // Grace Monday rescues it too, but only as the previous week's rescue.
      expect(t.stateOf("2027-03-08")).toBe("lit");
    });

    it("closes the grace window at 11:59 PM Monday Athens time across the DST change", () => {
      // Week of Oct 26; grace Monday is Nov 2 (EST). 23:59 EST = Tue 04:59Z.
      const meetings = [evening("2026-10-28")];
      const justBefore = new Date("2026-11-03T04:59:00Z");
      const justAfter = new Date("2026-11-03T05:00:00Z");
      expect(
        computeWeeklyStreak({
          meetings,
          activity: [],
          now: justBefore,
        }).stateOf("2026-10-26"),
      ).toBe("open");
      expect(
        computeWeeklyStreak({ meetings, activity: [], now: justAfter }).stateOf(
          "2026-10-26",
        ),
      ).toBe("dark");
    });
  });

  describe("semester boundaries", () => {
    it("carries a streak across the break between semesters", () => {
      const meetings = ["2026-11-11", "2027-01-20"];
      const s = computeWeeklyStreak({
        meetings: meetings.map(evening),
        activity: meetings.map(evening),
        now: evening("2027-01-22"),
      });
      expect(s.stateOf("2026-12-07")).toBe("no-meeting");
      expect(s.current).toBe(2);
    });
  });

  it("ignores activity that has not happened yet", () => {
    const s = computeWeeklyStreak({
      meetings: [evening("2026-09-09")],
      activity: [evening("2026-09-09")],
      now: evening("2026-09-08"),
    });
    expect(s.stateOf("2026-09-07")).toBe("open");
  });

  it("has an empty streak with no data", () => {
    const s = computeWeeklyStreak({ meetings: [], activity: [], now: NOW });
    expect(s.current).toBe(0);
    expect(s.longest).toBe(0);
  });
});
