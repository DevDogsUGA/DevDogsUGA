import { describe, expect, it } from "vitest";
import { isChunkLoadError } from "./chunkReload";

describe("isChunkLoadError", () => {
  it("knows each browser's failed import()", () => {
    for (const message of [
      "Failed to fetch dynamically imported module: https://devdogsuga.org/_next/static/chunks/AddToCalendar-Bg7fF_5x.js",
      "Importing a module script failed.",
      "error loading dynamically imported module: https://devdogsuga.org/a.js",
    ]) {
      expect(isChunkLoadError(new TypeError(message))).toBe(true);
    }
  });

  it("leaves every other error to the boundary", () => {
    expect(isChunkLoadError(new Error("Failed to fetch"))).toBe(false);
    expect(
      isChunkLoadError("Failed to fetch dynamically imported module"),
    ).toBe(false);
  });
});
