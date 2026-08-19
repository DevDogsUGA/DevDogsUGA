import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The argv each `gh` call builds, and what travels on stdin.
 *
 * Every other suite mocks this module wholesale, so the flags below are
 * covered nowhere else — and this is the layer where being wrong is silent: a
 * bad flag returns the wrong scope rather than failing. Two of them are
 * load-bearing by their ABSENCE (`listRepositoryVariables` has no `--env`;
 * `stdin.end(value)` has no trailing newline), which is exactly the kind of
 * claim a wholesale mock cannot make.
 *
 * `child_process` is faked at the module boundary; nothing here can tell you
 * what `gh` itself does with these calls.
 */
const fake = vi.hoisted(() => {
  interface ExecCall {
    file: string;
    args: string[];
    options: Record<string, unknown>;
  }
  interface SpawnCall {
    file: string;
    args: string[];
    options: Record<string, unknown>;
    /** Exactly what `stdin.end()` received. */
    written: unknown;
  }

  const state = {
    execCalls: [] as ExecCall[],
    execResult: { stdout: "" } as { stdout: string } | Error,
    spawnCalls: [] as SpawnCall[],
    spawnExit: { code: 0, stderr: "" },
  };

  // `client.ts` promisifies execFile at import, so the fake carries the
  // registered promisify symbol — without it, promisify would resolve the
  // bare stdout string and `const { stdout } = …` would come apart.
  const execFile: {
    (...args: unknown[]): void;
    [key: symbol]: unknown;
  } = Object.assign(vi.fn(), {
    [Symbol.for("nodejs.util.promisify.custom")]: async (
      file: string,
      args: string[],
      options: Record<string, unknown>,
    ) => {
      state.execCalls.push({ file, args, options });
      if (state.execResult instanceof Error) throw state.execResult;
      return state.execResult;
    },
  });

  function spawn(
    file: string,
    args: string[],
    options: Record<string, unknown>,
  ) {
    const call: SpawnCall = { file, args, options, written: undefined };
    state.spawnCalls.push(call);
    const handlers = new Map<string, (arg?: unknown) => void>();
    let onStderr: ((chunk: Buffer) => void) | undefined;
    return {
      stderr: {
        on: (_event: string, cb: (chunk: Buffer) => void) => {
          onStderr = cb;
        },
      },
      on: (event: string, cb: (arg?: unknown) => void) => {
        handlers.set(event, cb);
      },
      stdin: {
        // The client wires every handler before it writes, so firing the exit
        // from `end()` exercises the real ordering.
        end: (value: unknown) => {
          call.written = value;
          queueMicrotask(() => {
            if (state.spawnExit.stderr) {
              onStderr?.(Buffer.from(state.spawnExit.stderr));
            }
            handlers.get("close")?.(state.spawnExit.code);
          });
        },
      },
    };
  }

  return { state, execFile, spawn };
});

vi.mock("node:child_process", () => ({
  execFile: fake.execFile,
  spawn: fake.spawn,
}));

import {
  GhError,
  deleteSecret,
  deleteVariable,
  listRepositoryVariables,
  listSecrets,
  listVariables,
  setSecret,
  setVariable,
} from "./client.js";

beforeEach(() => {
  fake.state.execCalls.length = 0;
  fake.state.execResult = { stdout: "" };
  fake.state.spawnCalls.length = 0;
  fake.state.spawnExit = { code: 0, stderr: "" };
});

const lastExec = () => fake.state.execCalls.at(-1)!;
const lastSpawn = () => fake.state.spawnCalls.at(-1)!;

describe("the list calls", () => {
  it("lists environment secrets by name and date, never value", async () => {
    fake.state.execResult = {
      stdout: '[{"name":"DB_URL","updatedAt":"2026-01-01T00:00:00Z"}]',
    };
    const secrets = await listSecrets("staging");

    expect(lastExec().file).toBe("gh");
    expect(lastExec().args).toEqual([
      "secret",
      "list",
      "--env",
      "staging",
      "--json",
      "name,updatedAt",
    ]);
    expect(lastExec().options.shell).toBe(false);
    expect(secrets).toEqual([
      { name: "DB_URL", updatedAt: "2026-01-01T00:00:00Z" },
    ]);
  });

  it("lists environment variables WITH values", async () => {
    // The value is what turns the GitHub half of `audit` into a real
    // comparison for these keys, so the field list is the claim.
    await listVariables("staging");
    expect(lastExec().args).toEqual([
      "variable",
      "list",
      "--env",
      "staging",
      "--json",
      "name,value,updatedAt",
    ]);
  });

  it("⚠️ lists repository variables with NO --env — the missing flag is the call", async () => {
    // A repository read that quietly became an environment read would see the
    // managed copies and report the shadowing hazard as clean forever.
    await listRepositoryVariables();
    expect(lastExec().args).toEqual([
      "variable",
      "list",
      "--json",
      "name,updatedAt",
    ]);
    expect(lastExec().args).not.toContain("--env");
  });

  it("reads empty output as an empty list, not a parse error", async () => {
    // `gh` prints nothing at all for an environment with no entries.
    expect(await listSecrets("staging")).toEqual([]);
    expect(await listVariables("staging")).toEqual([]);
    expect(await listRepositoryVariables()).toEqual([]);
  });
});

describe("the set calls", () => {
  it("sets a secret with the value on stdin, byte-exact", async () => {
    await setSecret("staging", "DISCORD_TOKEN", "s3cret");

    expect(lastSpawn().file).toBe("gh");
    expect(lastSpawn().args).toEqual([
      "secret",
      "set",
      "DISCORD_TOKEN",
      "--env",
      "staging",
    ]);
    expect(lastSpawn().options.shell).toBe(false);
    // Not in argv anywhere — `ps` reads argv.
    expect(lastSpawn().args).not.toContain("s3cret");
    // And no trailing newline: `gh` stores stdin verbatim, so a stray "\n"
    // becomes part of the secret and every later comparison reads as a wrong
    // value rather than a stray byte.
    expect(lastSpawn().written).toBe("s3cret");
  });

  it("sets a variable the same way — stdin, no exception for public values", async () => {
    const multiline = "line one\nline two";
    await setVariable("staging", "PROJECT_REF", multiline);
    expect(lastSpawn().args).toEqual([
      "variable",
      "set",
      "PROJECT_REF",
      "--env",
      "staging",
    ]);
    // Byte-exact matters MORE here: the stored value is readable, so a stray
    // newline turns every audit into value-drift against an identical copy.
    expect(lastSpawn().written).toBe(multiline);
  });

  it("turns a nonzero exit into a GhError carrying stderr", async () => {
    fake.state.spawnExit = {
      code: 1,
      stderr: "HTTP 403: must have admin rights",
    };
    await expect(setSecret("staging", "K", "v")).rejects.toThrow(GhError);
    fake.state.spawnExit = {
      code: 1,
      stderr: "HTTP 403: must have admin rights",
    };
    await expect(setSecret("staging", "K", "v")).rejects.toThrow(
      /admin on the repository/,
    );
  });
});

describe("the delete calls", () => {
  it("deletes from the named environment and store", async () => {
    await deleteSecret("staging", "OLD_KEY");
    expect(lastExec().args).toEqual([
      "secret",
      "delete",
      "OLD_KEY",
      "--env",
      "staging",
    ]);

    await deleteVariable("staging", "OLD_VAR");
    expect(lastExec().args).toEqual([
      "variable",
      "delete",
      "OLD_VAR",
      "--env",
      "staging",
    ]);
  });
});

describe("failure descriptions carry a next step", () => {
  it("names the install page when gh is missing", async () => {
    fake.state.execResult = Object.assign(new Error("spawn gh ENOENT"), {
      code: "ENOENT",
    });
    await expect(listSecrets("staging")).rejects.toThrow(/cli\.github\.com/);
  });

  it("points an unauthenticated CLI at gh auth login", async () => {
    fake.state.execResult = Object.assign(new Error("exit 1"), {
      stderr: "gh: To get started with GitHub CLI, please run: gh auth login",
    });
    await expect(listSecrets("staging")).rejects.toThrow(/gh auth login/);
  });

  it("explains that a 404 usually means the environment does not exist", async () => {
    // An environment you cannot see and one that was never created look
    // identical from here, and a typo silently addresses a different one.
    fake.state.execResult = Object.assign(new Error("exit 1"), {
      stderr: "HTTP 404: Not Found",
    });
    await expect(listVariables("stagign")).rejects.toThrow(
      /does not exist yet/,
    );
  });
});
