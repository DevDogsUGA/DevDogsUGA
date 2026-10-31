// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isHeartbeatJob, JOB_HEARTBEATS, overdueJobs } from "./jobs";

const NOW = new Date("2026-10-08T15:00:00.000Z");
const hoursAgo = (hours: number) =>
  new Date(NOW.getTime() - hours * 60 * 60 * 1000);

const allAt = (succeededAt: Date) =>
  Object.keys(JOB_HEARTBEATS).map((job) => ({ job, succeededAt }));

describe("overdueJobs", () => {
  it("reports nothing while every job is within its allowance", () => {
    expect(overdueJobs(allAt(hoursAgo(25)), NOW)).toEqual([]);
  });

  it("reports a job older than its allowance, with when it last succeeded", () => {
    const rows = allAt(hoursAgo(1)).map((row) =>
      row.job === "schedule-builder-scrape"
        ? { ...row, succeededAt: hoursAgo(27) }
        : row,
    );
    expect(overdueJobs(rows, NOW)).toEqual([
      {
        job: "schedule-builder-scrape",
        lastSucceededAt: hoursAgo(27).toISOString(),
      },
    ]);
  });

  it("reports a job with no row at all", () => {
    const rows = allAt(hoursAgo(1)).filter(
      (row) => row.job !== "catalog-academic-programs",
    );
    expect(overdueJobs(rows, NOW)).toEqual([
      { job: "catalog-academic-programs", lastSucceededAt: null },
    ]);
  });

  it("reports the Devpost sync once it is older than 26 hours, or never recorded", () => {
    expect(JOB_HEARTBEATS["platform-devpost-sync"]).toEqual({
      maxAgeHours: 26,
    });
    const rows = allAt(hoursAgo(1)).map((row) =>
      row.job === "platform-devpost-sync"
        ? { ...row, succeededAt: hoursAgo(26.5) }
        : row,
    );
    expect(overdueJobs(rows, NOW)).toEqual([
      {
        job: "platform-devpost-sync",
        lastSucceededAt: hoursAgo(26.5).toISOString(),
      },
    ]);
    expect(
      overdueJobs(
        allAt(hoursAgo(1)).filter((row) => row.job !== "platform-devpost-sync"),
        NOW,
      ),
    ).toEqual([{ job: "platform-devpost-sync", lastSucceededAt: null }]);
  });

  it("ignores rows for jobs it does not know", () => {
    const rows = [
      ...allAt(hoursAgo(1)),
      { job: "retired-job", succeededAt: hoursAgo(1000) },
      { job: "platform-nightly-repair", succeededAt: hoursAgo(1000) },
    ];
    expect(overdueJobs(rows, NOW)).toEqual([]);
  });
});

describe("isHeartbeatJob", () => {
  it("accepts listed jobs only", () => {
    expect(isHeartbeatJob("schedule-builder-scrape")).toBe(true);
    expect(isHeartbeatJob("platform-devpost-sync")).toBe(true);
    expect(isHeartbeatJob("platform-nightly-repair")).toBe(false);
    expect(isHeartbeatJob("toString")).toBe(false);
    expect(isHeartbeatJob(undefined)).toBe(false);
  });
});
