import { describe, it, expect } from "vitest";
import { resolvePartsOfTermPerTerm } from "./termPartsOfTerm";
import type { AvailableTerm } from "./AvailableTerms";
import type { partsOfTerm } from "~/server/db/schema";

type PartOfTermRow = typeof partsOfTerm.$inferInsert;

function makeTerm(academicPeriod: number, description: string): AvailableTerm {
  return { academicPeriod, description, rows: [] };
}

function makeRow(academicPeriod: number, code: string): PartOfTermRow {
  return {
    academicPeriod,
    code,
    description: `Full Term ${academicPeriod}`,
    classesBegin: "2026-08-13",
    dropAddEnds: "2026-08-19",
    censusDate: "2026-09-02",
    withdrawalDeadline: "2026-11-10",
    classesEnd: "2026-12-05",
    finalsEnd: "2026-12-12",
  };
}

describe("resolvePartsOfTermPerTerm", () => {
  const termA = makeTerm(202608, "Fall 2026"); // resolves with rows
  const termB = makeTerm(202702, "Spring 2027"); // rejects
  const termC = makeTerm(202705, "Summer 2027"); // resolves empty

  const rejection = new Error("No calendar found for academic period 202702");

  const fetchFn = (academicPeriod: number) => {
    if (academicPeriod === termA.academicPeriod) {
      return Promise.resolve([makeRow(termA.academicPeriod, "1")]);
    }
    if (academicPeriod === termB.academicPeriod) {
      return Promise.reject(rejection);
    }
    if (academicPeriod === termC.academicPeriod) {
      return Promise.resolve([]);
    }
    throw new Error(`Unexpected academicPeriod: ${academicPeriod}`);
  };

  it("never rejects, even though one term's fetch throws", async () => {
    await expect(
      resolvePartsOfTermPerTerm([termA, termB, termC], fetchFn),
    ).resolves.toBeDefined();
  });

  it("puts the resolving term (with rows) in succeeded, and only that term", async () => {
    const { succeeded } = await resolvePartsOfTermPerTerm(
      [termA, termB, termC],
      fetchFn,
    );

    expect(succeeded).toHaveLength(1);
    expect(succeeded[0]?.academicPeriod).toBe(termA.academicPeriod);
    expect(succeeded[0]?.partOfTermRows).toEqual([
      makeRow(termA.academicPeriod, "1"),
    ]);
  });

  it("puts the rejecting term in failed, with its rejection reason", async () => {
    const { failed } = await resolvePartsOfTermPerTerm(
      [termA, termB, termC],
      fetchFn,
    );

    const failedB = failed.find(
      (f) => f.academicPeriod === termB.academicPeriod,
    );
    expect(failedB).toBeDefined();
    expect(failedB?.reason).toContain(rejection.message);
  });

  it("puts the empty-resolving term in failed, with an explicit no-rows reason", async () => {
    const { failed } = await resolvePartsOfTermPerTerm(
      [termA, termB, termC],
      fetchFn,
    );

    const failedC = failed.find(
      (f) => f.academicPeriod === termC.academicPeriod,
    );
    expect(failedC).toBeDefined();
    expect(failedC?.reason).toContain("no parts-of-term rows resolved");
  });

  it("failed contains exactly B and C, nothing else", async () => {
    const { failed } = await resolvePartsOfTermPerTerm(
      [termA, termB, termC],
      fetchFn,
    );

    expect(failed.map((f) => f.academicPeriod).sort()).toEqual(
      [termB.academicPeriod, termC.academicPeriod].sort(),
    );
  });
});
