/**
 * The guard that decides whether `run` is allowed to open a prompt, and the
 * `--tier production` guard `runTask` applies before it ever gets there.
 *
 * Worth its own file because every way of getting it wrong is silent. A picker
 * that asks when nobody is listening hangs instead of failing, holding a CI job
 * open until the workflow's timeout kills it with no output saying why. The
 * production guard fails the same way: a script that slipped past the confirm
 * would spawn turbo against live credentials with nobody watching.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `runTask` never returns for `--tier production` either — every path ends in
 * `passthrough`, which calls `process.exit` (see `pick.ts`'s own header) — so
 * these three modules are faked at the boundary rather than driven for real:
 * `node:child_process` so `passthrough` never actually spawns turbo,
 * `@clack/prompts` so the confirm is scripted rather than typed, and
 * `@devdogsuga/env/load` because `runTask` reaches it only through a dynamic
 * `import()` gated on `--tier` (see the header on why it must stay dynamic) —
 * `vi.mock` intercepts that the same as a static one.
 */
vi.mock("node:child_process", () => ({
  spawnSync: vi.fn(() => ({ status: 0 })),
}));

vi.mock("@clack/prompts", () => ({
  confirm: vi.fn(),
  isCancel: () => false,
  cancel: vi.fn(),
  multiselect: vi.fn(),
}));

vi.mock("@devdogsuga/env/load", () => ({
  loadEnvironment: vi.fn(async () => ({
    environment: "production",
    files: [],
    env: { FOO: "bar" },
    warnings: [],
  })),
  MissingEnvFileError: class MissingEnvFileError extends Error {},
}));

const { parseTierArg, runTask, shouldAsk } = await import("./pick.js");
const { spawnSync } = await import("node:child_process");
const { cancel, confirm } = await import("@clack/prompts");
const { loadEnvironment } = await import("@devdogsuga/env/load");

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

/**
 * `parseTierArg` is pure — no `process.exit` — specifically so it can be
 * tested here without going through `passthrough`, which every other path in
 * `runTask` ends at.
 */
describe("parseTierArg", () => {
  it("strips a valid tier and its value from rest", () => {
    expect(parseTierArg(["--tier", "staging", "--filter", "platform"])).toEqual(
      { tier: "staging", rest: ["--filter", "platform"] },
    );
  });

  it("accepts development and production too", () => {
    expect(parseTierArg(["--tier", "development"])).toEqual({
      tier: "development",
      rest: [],
    });
    expect(parseTierArg(["--tier", "production"])).toEqual({
      tier: "production",
      rest: [],
    });
  });

  it("errors when --tier has no value", () => {
    const result = parseTierArg(["--tier"]);
    expect(result.tier).toBeUndefined();
    expect(result.error).toContain("--tier requires a value");
  });

  it("errors when --tier's value looks like another flag", () => {
    const result = parseTierArg(["--tier", "--filter"]);
    expect(result.tier).toBeUndefined();
    expect(result.error).toContain("--tier requires a value");
  });

  it("errors on a value outside the canonical tier set, preflight included", () => {
    for (const bad of ["preflight", "prod", "bogus"]) {
      const result = parseTierArg(["--tier", bad]);
      expect(result.tier, bad).toBeUndefined();
      expect(result.error, bad).toContain(`unknown tier "${bad}"`);
    }
  });

  it("passes args through unchanged when --tier is absent", () => {
    expect(parseTierArg(["--filter", "platform", "--all"])).toEqual({
      rest: ["--filter", "platform", "--all"],
    });
  });
});

/**
 * `runTask`'s own gate on `--tier production`: refused outright without a
 * terminal, confirmed on one, and only loads `.env.production`'s credentials
 * into the child process once that confirm is approved. `--all` is passed
 * throughout so every case reaches `passthrough` directly instead of also
 * exercising the app multiselect, which is covered nowhere near this guard.
 *
 * `process.exit` is spied to throw rather than actually end the worker, which
 * is also how `passthrough`'s own exit — the one every one of these cases
 * eventually reaches — is observed.
 */
describe("runTask --tier production guard", () => {
  beforeEach(() => {
    // `restoreAllMocks()` below only rewinds spies made with `vi.spyOn`; the
    // plain `vi.fn()`s a module mock factory returns keep their call history
    // across tests, so each of these is reset by hand rather than trusted to
    // start clean.
    vi.mocked(spawnSync)
      .mockClear()
      .mockReturnValue({ status: 0 } as unknown as ReturnType<
        typeof spawnSync
      >);
    vi.mocked(confirm).mockReset();
    vi.mocked(cancel).mockClear();
    vi.mocked(loadEnvironment).mockResolvedValue({
      environment: "production",
      files: [],
      env: { FOO: "bar" },
      warnings: [],
    });
    vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`exit:${code ?? 0}`);
    });
  });

  it("refuses outright without a terminal, before any confirm or spawn", async () => {
    tty(false);
    await expect(
      runTask(["dev", "--all", "--tier", "production"]),
    ).rejects.toThrow("exit:1");
    expect(confirm).not.toHaveBeenCalled();
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it("runs nothing when the confirm is declined", async () => {
    tty(true);
    vi.mocked(confirm).mockResolvedValue(false);
    await expect(
      runTask(["dev", "--all", "--tier", "production"]),
    ).rejects.toThrow("exit:0");
    expect(cancel).toHaveBeenCalled();
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it("loads production's env and threads it to the child once approved", async () => {
    tty(true);
    vi.mocked(confirm).mockResolvedValue(true);
    await expect(
      runTask(["dev", "--all", "--tier", "production"]),
    ).rejects.toThrow("exit:0");

    expect(spawnSync).toHaveBeenCalledOnce();
    const options = vi.mocked(spawnSync).mock.calls[0]![2] as unknown as {
      env: NodeJS.ProcessEnv;
    };
    expect(options.env.DEPLOY_ENV).toBe("production");
    expect(options.env.FOO).toBe("bar");
  });

  it("does not gate a non-production tier behind a terminal", async () => {
    tty(false);
    await expect(
      runTask(["dev", "--all", "--tier", "staging"]),
    ).rejects.toThrow("exit:0");

    expect(confirm).not.toHaveBeenCalled();
    expect(spawnSync).toHaveBeenCalledOnce();
    const options = vi.mocked(spawnSync).mock.calls[0]![2] as unknown as {
      env: NodeJS.ProcessEnv;
    };
    expect(options.env.DEPLOY_ENV).toBe("staging");
  });
});

/**
 * `passthrough`'s two ways of ending, reached through `runTask` since
 * `passthrough` itself is not exported. Only the numeric-exit branch is
 * exercised here — the signal branch calls the real `process.kill` against
 * this process, and a mock that swallows it would leave the infinite loop
 * after it (the thing that keeps that branch honestly typed as `never`)
 * spinning forever with nothing left to interrupt it, hanging the test
 * runner rather than the process it is meant to end. There is no in-process
 * way to observe a self-delivered signal without either sending a real one
 * or faking enough of Node's signal machinery to make the assertion
 * meaningless.
 */
describe("passthrough exit code", () => {
  beforeEach(() => {
    vi.mocked(spawnSync).mockClear();
    vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`exit:${code ?? 0}`);
    });
  });

  it("exits with turbo's own status", async () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 3,
      signal: null,
    } as unknown as ReturnType<typeof spawnSync>);
    tty(true);
    vi.stubEnv("CI", "");
    vi.stubEnv("DEVDOGS_PICK", "");
    await expect(runTask(["build", "--all"])).rejects.toThrow("exit:3");
  });

  it("falls back to exit code 1 when turbo reports neither a status nor a signal", async () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: null,
      signal: null,
    } as unknown as ReturnType<typeof spawnSync>);
    tty(true);
    vi.stubEnv("CI", "");
    vi.stubEnv("DEVDOGS_PICK", "");
    await expect(runTask(["build", "--all"])).rejects.toThrow("exit:1");
  });
});
