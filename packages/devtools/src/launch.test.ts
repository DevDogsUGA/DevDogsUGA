/**
 * Unit tests for `stripTierFlag`, the one pure piece of `launch.ts`, plus
 * `launch()`'s bypasses: `--help`/`-h`, and the `setup`/`completions`
 * commands that must run before there is a tier to resolve.
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
const enterEnvironment = vi.fn(async (..._args: unknown[]) => ({
  files: [".env"],
  warnings: [],
  environment: {},
}));
vi.mock("@devdogsuga/env/session", () => ({
  availableTiers: vi.fn(),
  enterEnvironment: (...args: unknown[]) => enterEnvironment(...args),
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

  it("does not consume a following flag as the tier value", () => {
    // The guard every other flag-value reader in this CLI keeps. Without it,
    // `--tier --help` would swallow `--help` as a bogus tier and refuse with
    // "unknown tier" instead of reaching launch()'s help bypass.
    expect(stripTierFlag(["--tier", "--help", "db"])).toEqual({
      explicit: undefined,
      rest: ["--help", "db"],
    });
  });

  it("does not consume a single-dash flag as the tier value", () => {
    expect(stripTierFlag(["--tier", "-h", "db"])).toEqual({
      explicit: undefined,
      rest: ["-h", "db"],
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

  it("a valueless --tier right before --help still reaches the help bypass", async () => {
    const { launch } = await import("./launch.js");
    await launch(["--tier", "--help"]);
    expect(resolveSessionTier).not.toHaveBeenCalled();
    expect(main).toHaveBeenCalledWith(["--help"]);
  });

  it("a valueless --tier right before -h still reaches the help bypass", async () => {
    const { launch } = await import("./launch.js");
    await launch(["--tier", "-h"]);
    expect(resolveSessionTier).not.toHaveBeenCalled();
    expect(main).toHaveBeenCalledWith(["-h"]);
  });

  it("setup skips tier resolution and enters development — the bootstrap-deadlock guard", async () => {
    // `setup` exists to CREATE a missing env file; resolving a tier first
    // (say a stale DEPLOY_ENV=staging with no .env.staging) would refuse
    // before the one command that fixes that state could run.
    const { launch } = await import("./launch.js");
    await launch(["setup"]);
    expect(resolveSessionTier).not.toHaveBeenCalled();
    expect(enterEnvironment).toHaveBeenCalledWith("development", {
      override: false,
    });
    expect(main).toHaveBeenCalledWith(["setup"]);
  });

  it("completions skips tier resolution — shell rc files are non-TTY and read no env", async () => {
    const { launch } = await import("./launch.js");
    await launch(["completions", "bash"]);
    expect(resolveSessionTier).not.toHaveBeenCalled();
    expect(main).toHaveBeenCalledWith(["completions", "bash"]);
  });
});
