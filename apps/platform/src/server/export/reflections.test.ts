import { describe, expect, it } from "vitest";
import {
  parseReflectionsFilters,
  projectReflectionRow,
  type ReflectionRow,
} from "./reflectionsCsv";

const ROW: ReflectionRow = {
  userId: "user-1",
  preferredName: "Sam Rivera",
  email: "sam@uga.edu",
  githubLogin: "samrivera",
  activityType: "meeting",
  activityId: "meeting-1",
  activityTitle: "Dev Session",
  content: "What I learned this week...",
  submittedAt: new Date("2026-04-12T09:00:00-04:00"),
  createdAt: new Date("2026-04-10T18:00:00-04:00"),
  updatedAt: new Date("2026-04-12T09:00:00-04:00"),
  revisionCount: 2,
};

describe("projectReflectionRow", () => {
  it("orders the columns to match REFLECTIONS_COLUMNS and formats timestamps with an offset", () => {
    expect(projectReflectionRow(ROW)).toEqual([
      "user-1",
      "Sam Rivera",
      "sam@uga.edu",
      "samrivera",
      "meeting",
      "meeting-1",
      "Dev Session",
      "What I learned this week...",
      "2026-04-12T13:00:00.000Z",
      "2026-04-10T22:00:00.000Z",
      "2026-04-12T13:00:00.000Z",
      2,
    ]);
  });

  it("renders an unsubmitted draft's submittedAt as empty, not a placeholder date", () => {
    const projected = projectReflectionRow({ ...ROW, submittedAt: null });
    expect(projected[8]).toBe("");
  });
});

describe("parseReflectionsFilters", () => {
  it("parses from and to", () => {
    const url = new URL(
      "https://devdogsuga.org/export/reflections?from=2026-01-01&to=2026-05-01",
    );
    const filters = parseReflectionsFilters(url);
    expect(filters.from).toEqual(new Date("2026-01-01"));
    expect(filters.to).toEqual(new Date("2026-05-01"));
  });

  it("returns an empty object for no query parameters", () => {
    expect(
      parseReflectionsFilters(
        new URL("https://devdogsuga.org/export/reflections"),
      ),
    ).toEqual({});
  });
});
