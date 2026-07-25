import { describe, expect, it } from "vitest";
import toFixedLength from "./toFixedLength";

describe("toFixedLength", () => {
  it("left-pads with zeros up to the requested length", () => {
    expect(toFixedLength(7, 3)).toBe("007");
    expect(toFixedLength(42, 4)).toBe("0042");
  });

  it("leaves numbers already at or beyond the length unchanged", () => {
    expect(toFixedLength(123, 3)).toBe("123");
    expect(toFixedLength(12345, 3)).toBe("12345");
  });
});
