import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => {
  interface ExecCall {
    file: string;
    args: string[];
  }
  interface SpawnCall {
    file: string;
    args: string[];
    written: unknown;
  }

  const state = {
    execCalls: [] as ExecCall[],
    execResult: { stdout: "" } as { stdout: string } | Error,
    spawnCalls: [] as SpawnCall[],
    spawnExit: { code: 0, stdout: "", stderr: "" },
    spawnError: null as Error | null,
  };

  const execFile: {
    (...args: unknown[]): void;
    [key: symbol]: unknown;
  } = Object.assign(vi.fn(), {
    [Symbol.for("nodejs.util.promisify.custom")]: async (
      file: string,
      args: string[],
    ) => {
      state.execCalls.push({ file, args });
      if (state.execResult instanceof Error) throw state.execResult;
      return state.execResult;
    },
  });

  function spawn(file: string, args: string[]) {
    const call: SpawnCall = { file, args, written: undefined };
    state.spawnCalls.push(call);
    const handlers = new Map<string, (arg?: unknown) => void>();
    let onStdout: ((chunk: Buffer) => void) | undefined;
    let onStderr: ((chunk: Buffer) => void) | undefined;
    return {
      stdout: {
        on: (_event: string, cb: (chunk: Buffer) => void) => {
          onStdout = cb;
        },
      },
      stderr: {
        on: (_event: string, cb: (chunk: Buffer) => void) => {
          onStderr = cb;
        },
      },
      on: (event: string, cb: (arg?: unknown) => void) => {
        handlers.set(event, cb);
      },
      stdin: {
        end: (value: unknown) => {
          call.written = value;
          queueMicrotask(() => {
            if (state.spawnError) {
              handlers.get("error")?.(state.spawnError);
              return;
            }
            if (state.spawnExit.stdout)
              onStdout?.(Buffer.from(state.spawnExit.stdout));
            if (state.spawnExit.stderr)
              onStderr?.(Buffer.from(state.spawnExit.stderr));
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

vi.mock("./actors.js", () => ({
  resolveTeamId: vi.fn(async () => 9002),
  resolveAppId: vi.fn(async () => 7001),
}));

import { runGithubRulesets } from "./commands.js";
import {
  GhRulesetsError,
  createRuleset,
  deleteRuleset,
  getRuleset,
  listRulesets,
  updateRuleset,
} from "./api.js";
import type { DesiredRuleset } from "./types.js";

beforeEach(() => {
  fake.state.execCalls.length = 0;
  fake.state.execResult = { stdout: "" };
  fake.state.spawnCalls.length = 0;
  fake.state.spawnExit = { code: 0, stdout: "", stderr: "" };
  fake.state.spawnError = null;
});

const repo = { owner: "DevDogsUGA", repo: "DevDogsUGA" };

describe("reads", () => {
  it("lists rulesets with --paginate", async () => {
    fake.state.execResult = { stdout: '[{"id":1,"name":"main"}]' };
    const result = await listRulesets(repo);
    const call = fake.state.execCalls.at(-1)!;
    expect(call.file).toBe("gh");
    expect(call.args).toEqual([
      "api",
      "repos/DevDogsUGA/DevDogsUGA/rulesets",
      "--paginate",
    ]);
    expect(result).toEqual([{ id: 1, name: "main" }]);
  });

  it("gets one ruleset by id", async () => {
    fake.state.execResult = { stdout: '{"id":42,"name":"main"}' };
    const result = await getRuleset(repo, 42);
    expect(fake.state.execCalls.at(-1)!.args).toEqual([
      "api",
      "repos/DevDogsUGA/DevDogsUGA/rulesets/42",
    ]);
    expect(result).toEqual({ id: 42, name: "main" });
  });

  it("wraps a failed read in GhRulesetsError", async () => {
    fake.state.execResult = Object.assign(new Error("boom"), {
      stderr: "HTTP 404",
    });
    await expect(listRulesets(repo)).rejects.toBeInstanceOf(GhRulesetsError);
  });

  it("preserves JSON validation details from failed reads", async () => {
    fake.state.execResult = Object.assign(new Error("gh failed"), {
      stderr: "gh: Validation Failed (HTTP 422)",
      stdout: JSON.stringify({ errors: ["Invalid ruleset target"] }),
    });
    await expect(getRuleset(repo, 42)).rejects.toThrow(
      "gh: Validation Failed (HTTP 422)\nInvalid ruleset target",
    );
  });
});

const desired: DesiredRuleset = {
  name: "main",
  target: "branch",
  enforcement: "active",
  bypass_actors: [
    { actor_id: 9002, actor_type: "Team", bypass_mode: "always" },
  ],
  conditions: { ref_name: { include: ["refs/heads/main"], exclude: [] } },
  rules: [{ type: "deletion" }],
};

describe("writes", () => {
  it("creates a ruleset by POSTing the desired payload on stdin", async () => {
    fake.state.spawnExit = { code: 0, stdout: '{"id":1}', stderr: "" };
    const result = await createRuleset(repo, desired);
    const call = fake.state.spawnCalls.at(-1)!;
    expect(call.args).toEqual([
      "api",
      "repos/DevDogsUGA/DevDogsUGA/rulesets",
      "-X",
      "POST",
      "--input",
      "-",
    ]);
    expect(JSON.parse(call.written as string)).toEqual(desired);
    expect(result).toEqual({ id: 1 });
  });

  it("updates a ruleset by PUTting /rulesets/{id}", async () => {
    fake.state.spawnExit = { code: 0, stdout: '{"id":42}', stderr: "" };
    await updateRuleset(repo, 42, desired);
    const call = fake.state.spawnCalls.at(-1)!;
    expect(call.args).toEqual([
      "api",
      "repos/DevDogsUGA/DevDogsUGA/rulesets/42",
      "-X",
      "PUT",
      "--input",
      "-",
    ]);
  });

  it("deletes a ruleset by id", async () => {
    fake.state.spawnExit = { code: 0, stdout: "", stderr: "" };
    await deleteRuleset(repo, 99);
    const call = fake.state.spawnCalls.at(-1)!;
    expect(call.args).toEqual([
      "api",
      "repos/DevDogsUGA/DevDogsUGA/rulesets/99",
      "-X",
      "DELETE",
      "--input",
      "-",
    ]);
  });

  it("rejects with GhRulesetsError on a non-zero exit", async () => {
    fake.state.spawnExit = {
      code: 1,
      stdout: "",
      stderr: "HTTP 403 Forbidden",
    };
    await expect(createRuleset(repo, desired)).rejects.toBeInstanceOf(
      GhRulesetsError,
    );
  });

  it.each([
    createRuleset,
    (r: typeof repo, d: DesiredRuleset) => updateRuleset(r, 42, d),
  ])(
    "preserves validation details without dumping unrelated response fields",
    async (write) => {
      fake.state.spawnExit = {
        code: 1,
        stderr: "gh: Validation Failed (HTTP 422)",
        stdout: JSON.stringify({
          message: "Validation Failed",
          errors: [
            "Invalid rule configuration",
            {
              field: "rules",
              code: "invalid",
              message: "Unknown rule type",
              value: "private-value",
            },
            { field: "bypass_actors", code: "unprocessable" },
            null,
            42,
            { message: { nested: "private-nested" } },
          ],
          headers: { authorization: "private-token" },
          request: { body: "private-request" },
        }),
      };
      await expect(write(repo, desired)).rejects.toThrow(
        /^gh: Validation Failed \(HTTP 422\)\nInvalid rule configuration\nfield: rules, code: invalid, message: Unknown rule type\nfield: bypass_actors, code: unprocessable$/,
      );
    },
  );

  it.each([
    ["not JSON", "HTTP 502 Bad Gateway", "HTTP 502 Bad Gateway"],
    ["", "connection refused", "connection refused"],
    ["<html>private-response</html>", "", "gh failed with no output."],
    [
      JSON.stringify({
        message: "Validation Failed",
        errors: "Invalid target",
      }),
      "HTTP 422",
      "HTTP 422\nValidation Failed\nInvalid target",
    ],
    [
      JSON.stringify({
        errors: { field: "rules", code: "invalid", message: "Bad\nrule\u001b" },
      }),
      "HTTP 422",
      "HTTP 422\nfield: rules, code: invalid, message: Bad rule",
    ],
    [
      JSON.stringify({ errors: [null, 42, {}, { field: ["rules"] }] }),
      "HTTP 422",
      "HTTP 422",
    ],
    ["null", "HTTP 422", "HTTP 422"],
  ])(
    "formats failed responses safely (%s)",
    async (stdout, stderr, expected) => {
      fake.state.spawnExit = { code: 1, stdout, stderr };
      await expect(createRuleset(repo, desired)).rejects.toThrow(expected);
    },
  );

  it("preserves process/network failure messages", async () => {
    fake.state.spawnError = new Error("spawn gh ENOENT");
    await expect(createRuleset(repo, desired)).rejects.toThrow(
      "spawn gh ENOENT",
    );
  });

  it("prints response details through the real apply failure path and returns failure", async () => {
    fake.state.execResult = { stdout: "[]" };
    fake.state.spawnExit = {
      code: 1,
      stderr: "gh: Validation Failed (HTTP 422)",
      stdout: JSON.stringify({
        errors: [
          { field: "rules", code: "invalid", message: "Unsupported rule" },
        ],
      }),
    };
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    try {
      expect(await runGithubRulesets(["--apply", "--yes"])).toBe(1);
      expect(stderr).toHaveBeenCalledWith(
        "backstage github rulesets: apply failed: gh: Validation Failed (HTTP 422)\nfield: rules, code: invalid, message: Unsupported rule\n",
      );
      expect(fake.state.spawnCalls).toHaveLength(1);
      expect(log).not.toHaveBeenCalledWith("Applied.");
    } finally {
      log.mockRestore();
      stderr.mockRestore();
    }
  });
});
