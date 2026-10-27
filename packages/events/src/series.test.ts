import { describe, expect, it } from "vitest";
import seriesFile from "./data/series.json" with { type: "json" };
import { seriesConfigSchema } from "./series";

const base = {
  id: "merge-monday",
  name: "Merge Monday",
  category: "build",
  brand: "devdogs",
  headline: "series",
};

describe("seriesConfigSchema", () => {
  it("accepts the committed series.json", () => {
    const parsed = seriesConfigSchema.parse(seriesFile);
    expect(parsed.series.map((s) => s.id)).toContain("merge-monday");
  });

  it("accepts a minimal series", () => {
    expect(seriesConfigSchema.safeParse({ series: [base] }).success).toBe(true);
  });

  it.each([
    ["an unknown category", { category: "party" }],
    ["an unknown brand", { brand: "acme" }],
    ["an unknown headline", { headline: "both" }],
    ["a bad id", { id: "Merge Monday" }],
    ["an unknown key", { colour: "red" }],
    [
      "a malformed slot",
      { slot: { weekday: "monday", start: "6pm", end: "8" } },
    ],
  ])("rejects %s", (_name, override) => {
    expect(
      seriesConfigSchema.safeParse({ series: [{ ...base, ...override }] })
        .success,
    ).toBe(false);
  });
});
