import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv.js";

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, embedded commas and newlines", () => {
    expect(parseCsv('a,"b,c","d ""e""","f\ng"\r\nh')).toEqual([
      ["a", "b,c", 'd "e"', "f\ng"],
      ["h"],
    ]);
  });
});
