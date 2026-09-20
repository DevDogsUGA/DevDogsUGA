/**
 * Unit tests for `stripTierFlag`, the one pure piece of `launch.ts`, plus
 * `launch()`'s `--help`/`-h` bypass.
 *
 * Everything else in that module either resolves the real filesystem
 * (`availableTiers`), mutates `process.env` (`enterEnvironment`), or exits
 * the process outright on refusal — none of which belongs in a unit test.
 * `resolveSessionTier` itself already carries the policy coverage, in
 * `@devdogsuga/env`'s own `session.test.ts`; this file is only about argv
 * surgery and the one branch of `launch()` that is safe to exercise without
 * either of those.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { stripTierFlag } from "./launch.js";

const resolveSessionTier = vi.fn();
vi.mock("@devdogsuga/env/session", () => ({
  availableTiers: vi.fn(),
  enterEnvironment: vi.fn(),
  resolveSessionTier: (...args: unknown[]) => resolveSessionTier(...args),
}));

const main = vi.fn();
vi.mock("./cli.js", () => ({ main: (...args: unknown[]) => main(...args) }));

describe("stripTierFlag", () => {
  it("returns argv untouched when --tier is absent", () => {
    expect(stripTierFlag(["db", "status", "--target", "remote"])).toEqual({
      explicit: undefined,
      rest: ["db", "status", "--target", "remote"],
    });
  });

  it("strips a leading --tier and its value", () => {
    expect(stripTierFlag(["--tier", "staging", "db", "status"])).toEqual({
      explicit: "staging",
      rest: ["db", "status"],
    });
  });

  it("strips --tier from the middle, leaving the rest in order", () => {
    expect(
      stripTierFlag([
        "db",
        "status",
        "--tier",
        "production",
        "--target",
        "remote",
      ]),
    ).toEqual({
      explicit: "production",
      rest: ["db", "status", "--target", "remote"],
    });
  });

  it("strips a trailing --tier with no value, leaving no explicit tier", () => {
    expect(stripTierFlag(["db", "status", "--tier"])).toEqual({
      explicit: undefined,
      rest: ["db", "status"],
    });
  });

  it("leaves a command's own --tier-shaped flag alone when named differently", () => {
    // Sanity check: this function only ever looks for the literal "--tier"
    // token, so a command's own `--target`/`--app` flags are never touched.
    expect(stripTierFlag(["cf", "preview", "--app", "platform"])).toEqual({
      explicit: undefined,
      rest: ["cf", "preview", "--app", "platform"],
    });
  });
});

describe("launch", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("routes --help straight to cli.ts without resolving a tier", async () => {
    const { launch } = await import("./launch.js");
    await launch(["--help"]);
    expect(resolveSessionTier).not.toHaveBeenCalled();
    expect(main).toHaveBeenCalledWith(["--help"]);
  });

  it("routes -h straight to cli.ts without resolving a tier", async () => {
    const { launch } = await import("./launch.js");
    await launch(["db", "-h"]);
    expect(resolveSessionTier).not.toHaveBeenCalled();
    expect(main).toHaveBeenCalledWith(["db", "-h"]);
  });

  it("still strips a --tier flag ahead of a --help bypass", async () => {
    const { launch } = await import("./launch.js");
    await launch(["--tier", "staging", "db", "--help"]);
    expect(resolveSessionTier).not.toHaveBeenCalled();
    expect(main).toHaveBeenCalledWith(["db", "--help"]);
  });
});
