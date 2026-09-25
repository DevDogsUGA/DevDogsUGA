import { describe, expect, it } from "vitest";
import { checkDevtoolsMinimums, compareVersions } from "./devtools-minimums.js";

/**
 * Runs the real check against this repo's actual `devtools-minimums.json`
 * and root `package.json` — same reasoning as `workers.test.ts` and
 * `env-completeness.test.ts` in this package: the fact being asserted is
 * about THIS repo's own committed files, not a fixture standing in for them.
 */
describe("devtools-minimums.json", () => {
  it('keeps "latest" equal to package.json\'s @devdogsuga/devtools pin, and "minimum" at or below it', () => {
    const result = checkDevtoolsMinimums();
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });
});

describe("compareVersions", () => {
  it("orders three-part versions numerically, not lexically", () => {
    expect(compareVersions("0.2.0", "0.10.0")).toBeLessThan(0);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("1.2.3", "1.2.2")).toBeGreaterThan(0);
  });
});
