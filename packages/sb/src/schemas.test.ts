import { describe, expect, it } from "vitest";
import { SCHEMAS } from "./schemas.js";

describe("SCHEMAS", () => {
  it("maps each app key to its Postgres schema name", () => {
    expect(SCHEMAS).toEqual({
      platform: "platform",
      scheduleBuilder: "schedule_builder",
      studyGroupFinder: "study_group_finder",
      sandbox: "sandbox",
    });
  });

  it("has a unique schema name per app", () => {
    const values = Object.values(SCHEMAS);
    expect(new Set(values).size).toBe(values.length);
  });
});
