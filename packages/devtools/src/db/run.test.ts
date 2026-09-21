import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `run()`'s missing-binary handling and `seedBuckets()`'s exact argv, both
 * silent-failure-shaped: a spawn `error` event with no listener crashes the
 * whole process instead of returning a code, and a wrong flag combination
 * for the remote branch is a CLI rejection that only ever shows up against a
 * real hosted project. `node:child_process` is faked at the module boundary
 * so both are observable without actually shelling out to pnpm or supabase.
 */
const fake = vi.hoisted(() => {
  interface SpawnCall {
    file: string;
    args: string[];
  }

  const state = {
    spawnCalls: [] as SpawnCall[],
    /** Set per-test: either an exit code or an `error` event to emit instead. */
    behavior: { kind: "exit", code: 0 } as
      { kind: "exit"; code: number } | { kind: "error"; error: Error },
  };

  function spawn(file: string, args: string[]) {
    state.spawnCalls.push({ file, args });
    const handlers = new Map<string, (arg?: unknown) => void>();
    queueMicrotask(() => {
      if (state.behavior.kind === "error") {
        handlers.get("error")?.(state.behavior.error);
      } else {
        handlers.get("exit")?.(state.behavior.code);
      }
    });
    return {
      on: (event: string, cb: (arg?: unknown) => void) => {
        handlers.set(event, cb);
      },
    };
  }

  return { state, spawn };
});

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, spawn: fake.spawn };
});

const { run, seedBuckets } = await import("./run.js");

beforeEach(() => {
  fake.state.spawnCalls.length = 0;
  fake.state.behavior = { kind: "exit", code: 0 };
});

describe("run", () => {
  it("resolves the exit code on a normal exit", async () => {
    fake.state.behavior = { kind: "exit", code: 3 };
    await expect(run(["build"])).resolves.toBe(3);
  });

  it("resolves 1 instead of crashing when the binary can't be spawned", async () => {
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    fake.state.behavior = {
      kind: "error",
      error: new Error("spawn pnpm ENOENT"),
    };
    await expect(run(["build"])).resolves.toBe(1);
    expect(stderr).toHaveBeenCalledWith(
      expect.stringContaining("spawn pnpm ENOENT"),
    );
    stderr.mockRestore();
  });
});

describe("seedBuckets", () => {
  it("seeds the local stack with --local --yes", async () => {
    await seedBuckets({ kind: "local" });
    expect(fake.state.spawnCalls).toEqual([
      {
        file: "pnpm",
        args: ["exec", "supabase", "seed", "buckets", "--local", "--yes"],
      },
    ]);
  });

  it("refuses a remote target with no project ref, without spawning", async () => {
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    const code = await seedBuckets({ kind: "remote", projectRef: undefined });
    expect(code).toBe(1);
    expect(fake.state.spawnCalls).toEqual([]);
    stderr.mockRestore();
  });

  // `supabase seed buckets` rejects a bare `--project-ref` as mutually
  // exclusive with the implied `--local` default; `--linked` is required
  // alongside it, and does not depend on any on-disk `supabase link` state
  // (verified empirically against an unlinked checkout).
  it("targets the resolved tier's project with --project-ref and --linked", async () => {
    await seedBuckets({ kind: "remote", projectRef: "abcdefghijklmnopqrst" });
    expect(fake.state.spawnCalls).toEqual([
      {
        file: "pnpm",
        args: [
          "exec",
          "supabase",
          "seed",
          "buckets",
          "--project-ref",
          "abcdefghijklmnopqrst",
          "--linked",
        ],
      },
    ]);
  });
});
