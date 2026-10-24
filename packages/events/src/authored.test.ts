import { describe, expect, it } from "vitest";
import { getAuthoredFiles, validateConfigFiles } from "./index";

describe("getAuthoredFiles", () => {
  it("returns the committed files, and a copy each time", () => {
    const a = getAuthoredFiles();
    const b = getAuthoredFiles();
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    (a.meetings as { meetings: unknown[] }).meetings.length = 0;
    expect(
      (b.meetings as { meetings: unknown[] }).meetings.length,
    ).toBeGreaterThan(0);
  });
});

describe("validateConfigFiles", () => {
  it("accepts the committed files", () => {
    expect(validateConfigFiles(getAuthoredFiles())).toEqual({ ok: true });
  });

  it("reports a shape error as a sentence naming where", () => {
    const files = getAuthoredFiles();
    (files.meetings as { meetings: { slug: string }[] }).meetings[0]!.slug =
      "not a slug";
    const result = validateConfigFiles(files);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join("\n")).toContain("meetings.0.slug");
    }
  });

  it("reports a publishability error from the validator", () => {
    const files = getAuthoredFiles();
    (files.meetings as { meetings: { venue?: string }[] }).meetings[0]!.venue =
      "nowhere";
    const result = validateConfigFiles(files);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join("\n")).toContain("nowhere");
  });

  it("refuses a meeting beyond the semester's art, as CI's semesters check does", () => {
    const files = getAuthoredFiles();
    const list = (files.meetings as { meetings: Record<string, unknown>[] })
      .meetings;
    list.push({
      slug: "2026-12-02",
      series: "merge-monday",
      startsAt: "2026-12-02T23:00:00.000Z",
      endsAt: "2026-12-03T01:00:00.000Z",
      rsvpUrl: null,
      cancelledAt: null,
      cancellationReason: null,
      surveyUrl: null,
      questions: ["how_did_you_learn"],
      agenda: [],
    });
    const result = validateConfigFiles(files);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join("\n")).toContain("no region");
  });

  it("reports every problem, not just the first", () => {
    const files = getAuthoredFiles();
    const list = (files.meetings as { meetings: { summary?: string }[] })
      .meetings;
    list[0]!.summary = "x".repeat(500);
    list[1]!.summary = "y".repeat(500);
    const result = validateConfigFiles(files);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });
});
