import { describe, expect, it } from "vitest";
import { formatHours } from "./format";

describe("formatHours", () => {
  it("writes whole hours bare and quarter hours with decimals", () => {
    expect(formatHours(0)).toBe("0");
    expect(formatHours(3)).toBe("3");
    expect(formatHours(1.5)).toBe("1.5");
    expect(formatHours(0.25)).toBe("0.25");
    expect(formatHours(2.75)).toBe("2.75");
  });
});
