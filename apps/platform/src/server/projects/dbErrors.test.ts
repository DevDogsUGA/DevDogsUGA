import { describe, expect, it } from "vitest";
import {
  conflictingSha,
  guardMessage,
  isUniqueViolationOf,
  pgFailure,
} from "./dbErrors";

const SHA = "ab".repeat(20);
const unique = (constraint: string, detail = "") =>
  Object.assign(
    new Error(`duplicate key value violates unique constraint "${constraint}"`),
    { code: "23505", constraint_name: constraint, detail },
  );

describe("pgFailure", () => {
  it("finds the driver's error under Drizzle's wrapper", () => {
    const wrapped = new Error("Failed query", {
      cause: unique("projectReportCommits_sha_key"),
    });
    expect(pgFailure(wrapped)?.constraint).toBe("projectReportCommits_sha_key");
  });
  it("reads the constraint from the message when the driver omits it", () => {
    const error = Object.assign(
      new Error(
        'duplicate key value violates unique constraint "projects_name_key"',
      ),
      { code: "23505" },
    );
    expect(isUniqueViolationOf(error, "projects_name_key")).toBe(true);
    expect(isUniqueViolationOf(error, "projects_slug_key")).toBe(false);
  });
  it("is null for a plain error", () => {
    expect(pgFailure(new Error("boom"))).toBeNull();
  });
});

describe("the commit a SHA clash names", () => {
  it("is read from the detail line", () => {
    const error = unique(
      "projectReportCommits_sha_key",
      `Key (sha)=(${SHA}) already exists.`,
    );
    expect(conflictingSha(error)).toBe(SHA);
  });
  it("is null when the driver gives no detail", () => {
    expect(conflictingSha(unique("projectReportCommits_sha_key"))).toBeNull();
  });
});

describe("guardMessage", () => {
  it("words each guard trigger's refusal", () => {
    for (const raised of [
      "At most ten project repository links",
      "Repository link supports report citations",
      "Project cannot be deleted",
      "Commit author, provenance, approved project link or Eastern date is ineligible",
    ]) {
      const error = Object.assign(new Error(raised), { code: "P0001" });
      expect(guardMessage(error)).toBeTruthy();
    }
  });
  it("ignores anything else", () => {
    expect(
      guardMessage(Object.assign(new Error("x"), { code: "P0001" })),
    ).toBeNull();
    expect(guardMessage(new Error("Project cannot be deleted"))).toBeNull();
  });
});
