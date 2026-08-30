/**
 * The guard that decides whether `run` is allowed to open a prompt.
 *
 * Worth its own file because every way of getting it wrong is silent. A picker
 * that asks when nobody is listening hangs instead of failing, holding a CI job
 * open until the workflow's timeout kills it with no output saying why.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { shouldAsk } from "./pick.js";

/**
 * `process.stdin.isTTY` is a plain data property, not an accessor. Node defines
 * it only when stdin IS a terminal, so `vi.spyOn(…, "get")` has nothing to
 * replace and throws. Assigning and restoring by hand is the portable way, and
 * every test must set it: on a developer's terminal it is already `true` while
 * under CI it is absent, so a test that left it alone would pass or fail
 * depending on where it ran.
 */
const REAL_TTY = process.stdin.isTTY;

function tty(value: boolean): void {
  process.stdin.isTTY = value;
}

afterEach(() => {
  process.stdin.isTTY = REAL_TTY;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("shouldAsk", () => {
  it("asks on an interactive terminal with no filter", () => {
    tty(true);
    vi.stubEnv("CI", "");
    vi.stubEnv("DEVDOGS_PICK", "");
    expect(shouldAsk([])).toBe(true);
  });

  it("never asks under CI", () => {
    tty(true);
    vi.stubEnv("CI", "true");
    expect(shouldAsk([])).toBe(false);
  });

  it("never asks without a TTY", () => {
    tty(false);
    vi.stubEnv("CI", "");
    expect(shouldAsk([])).toBe(false);
  });

  it("never asks when the recursion guard is set", () => {
    tty(true);
    vi.stubEnv("CI", "");
    vi.stubEnv("DEVDOGS_PICK", "0");
    expect(shouldAsk([])).toBe(false);
  });

  // Turbo spells the same idea three ways, and each accepts both a separate
  // value and an `=` form. Missing one would mean asking a caller to repeat a
  // choice they had already made on the command line.
  it.each([
    ["--filter", "platform"],
    ["-F", "platform"],
    ["--scope", "platform"],
  ])("defers to an explicit %s", (flag, value) => {
    tty(true);
    vi.stubEnv("CI", "");
    vi.stubEnv("DEVDOGS_PICK", "");
    expect(shouldAsk([flag, value])).toBe(false);
    expect(shouldAsk([`${flag}=${value}`])).toBe(false);
  });

  it("is not fooled by a flag that merely starts the same way", () => {
    tty(true);
    vi.stubEnv("CI", "");
    vi.stubEnv("DEVDOGS_PICK", "");
    // `--force` is not `-F`, and turbo has flags that begin with these
    // letters. Prefix matching is only ever applied to the `=` form.
    expect(shouldAsk(["--force"])).toBe(true);
  });
});
