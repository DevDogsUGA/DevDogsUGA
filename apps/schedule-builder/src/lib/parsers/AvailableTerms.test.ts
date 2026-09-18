import { afterEach, describe, expect, it, vi } from "vitest";
import { detectAvailableTerms, fetchSemesterCsv } from "./AvailableTerms";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

function csvFor(academicPeriod: number): string {
  return `ACADEMIC_PERIOD\n${academicPeriod}\n`;
}

function asUrl(i: string | URL | Request): string {
  return typeof i === "string" ? i : i instanceof URL ? i.href : i.url;
}

describe("detectAvailableTerms", () => {
  it("returns a term for every semester whose CSV resolves", async () => {
    global.fetch = vi.fn((url: string | URL | Request) => {
      if (asUrl(url).includes("spring.csv")) {
        return Promise.resolve(new Response(csvFor(202602), { status: 200 }));
      }
      return Promise.resolve(new Response("", { status: 404 }));
    });

    const { terms, failedFetches } = await detectAvailableTerms();

    expect(terms).toHaveLength(1);
    expect(terms[0]?.academicPeriod).toBe(202602);
    expect(failedFetches.map((f) => f.semester).sort()).toEqual([
      "fall",
      "summer",
    ]);
  });

  it("surfaces a non-ok response as a failedFetches entry carrying its status, not a silent skip", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(new Response("", { status: 502 })),
    );

    const { terms, failedFetches } = await detectAvailableTerms();

    expect(terms).toHaveLength(0);
    expect(failedFetches).toHaveLength(3);
    for (const f of failedFetches) {
      expect(f.status).toBe(502);
      expect(f.error).toBeDefined();
    }
    expect(failedFetches.map((f) => f.semester).sort()).toEqual([
      "fall",
      "spring",
      "summer",
    ]);
  });

  it("surfaces a throwing fetch as a failedFetches entry, without status", async () => {
    const networkError = new Error("network down");
    global.fetch = vi.fn(() => Promise.reject(networkError));

    const { terms, failedFetches } = await detectAvailableTerms();

    expect(terms).toHaveLength(0);
    expect(failedFetches).toHaveLength(3);
    for (const f of failedFetches) {
      expect(f.status).toBeUndefined();
      expect(f.error).toContain("network down");
    }
  });

  it("does not let one semester's failure stop the others from being attempted", async () => {
    global.fetch = vi.fn((url: string | URL | Request) => {
      if (asUrl(url).includes("spring.csv")) {
        return Promise.reject(new Error("spring is down"));
      }
      if (asUrl(url).includes("summer.csv")) {
        return Promise.resolve(new Response(csvFor(202605), { status: 200 }));
      }
      return Promise.resolve(new Response("", { status: 500 }));
    });

    const { terms, failedFetches } = await detectAvailableTerms();

    expect(terms.map((t) => t.academicPeriod)).toEqual([202605]);
    expect(failedFetches.map((f) => f.semester).sort()).toEqual([
      "fall",
      "spring",
    ]);
  });
});

describe("fetchSemesterCsv", () => {
  it("returns null (not a failure) when the CSV has no parseable ACADEMIC_PERIOD", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(new Response("SOME_COLUMN\nx\n", { status: 200 })),
    );

    await expect(fetchSemesterCsv("fall")).resolves.toBeNull();
  });

  it("throws for a non-ok response", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(new Response("", { status: 503 })),
    );

    await expect(fetchSemesterCsv("fall")).rejects.toThrow(/503/);
  });
});
