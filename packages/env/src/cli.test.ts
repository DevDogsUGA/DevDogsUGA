/**
 * The `with-env` bin's process contract, driven through the real CLI.
 *
 * `cli.ts` is a top-level script, not an exported function — it calls
 * `program.parse()`, may `process.exit()`, and spawns a child process of its
 * own — so the only way to see what a contributor actually sees (exit code,
 * stderr, and what the wrapped command received) is to run it.
 *
 * The subprocess is pointed at a SYNTHETIC repo root (via
 * `WITH_ENV_ROOT_FOR_TESTS` — see `cli.ts`'s comment at the override) holding
 * a known set of tier files, never at the real one. Which `.env*` files exist
 * at the real root is per-machine state: a contributor who has run `env pull`
 * has all three tiers, a fresh clone and CI have none, and the first version
 * of this file asserted the ambiguity refusal against that state — green on
 * exactly the machines that had pulled staging and production, red everywhere
 * else, CI included.
 *
 * The child never inherits `process.env`: a developer's shell may already
 * hold `DEPLOY_ENV`, and that would silently pick which branch each test
 * exercises instead of the test itself deciding.
 */
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const run = promisify(execFile);

function findRepoRoot(from: string): string {
  for (let dir = from; ;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error("cli.test.ts: could not locate the monorepo root.");
    }
    dir = parent;
  }
}

const PROJECT_ROOT = findRepoRoot(dirname(fileURLToPath(import.meta.url)));
const TSX = join(PROJECT_ROOT, "node_modules", ".bin", "tsx");
const CLI = join(PROJECT_ROOT, "packages", "env", "src", "cli.ts");

/** The synthetic root: all three deploy tiers present, so the ambiguity path
 * is exercised deterministically on every machine. */
let fixtureRoot: string;
beforeAll(() => {
  fixtureRoot = mkdtempSync(join(tmpdir(), "with-env-cli-test-"));
  writeFileSync(join(fixtureRoot, ".env"), 'TIER_MARK="development"\n');
  writeFileSync(join(fixtureRoot, ".env.staging"), 'TIER_MARK="staging"\n');
  writeFileSync(
    join(fixtureRoot, ".env.production"),
    'TIER_MARK="production"\n',
  );
});
afterAll(() => {
  rmSync(fixtureRoot, { recursive: true, force: true });
});

// A cold `tsx` boot of a TypeScript process is far slower than an in-process
// unit test; every test here intentionally pays that cost.
const CLI_TEST_TIMEOUT = 15_000;
vi.setConfig({ testTimeout: CLI_TEST_TIMEOUT });
afterAll(() => {
  vi.resetConfig();
});

interface Result {
  code: number;
  stdout: string;
  stderr: string;
}

async function withEnv(
  args: string[],
  env: Record<string, string> = {},
): Promise<Result> {
  try {
    const { stdout, stderr } = await run(
      TSX,
      ["--conditions=devdogs-source", CLI, ...args],
      {
        cwd: PROJECT_ROOT,
        // PATH and HOME only — see the header. In particular, no ambient
        // DEPLOY_ENV.
        env: {
          PATH: process.env.PATH ?? "",
          HOME: process.env.HOME ?? "",
          WITH_ENV_ROOT_FOR_TESTS: fixtureRoot,
          ...env,
        },
      },
    );
    return { code: 0, stdout, stderr };
  } catch (error) {
    const e = error as { code?: number; stdout?: string; stderr?: string };
    return {
      code: e.code ?? 1,
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
    };
  }
}

describe("with-env tier resolution", () => {
  it("refuses ambiguity: no --tier, no DEPLOY_ENV, multiple tier files present", async () => {
    const { code, stdout, stderr } = await withEnv(["node", "-e", "0"]);
    expect(code).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("with-env:");
    expect(stderr).toContain("multiple deploy tiers are present");
    expect(stderr).toContain(".env");
    expect(stderr).toContain(".env.staging");
    expect(stderr).toContain(".env.production");
    expect(stderr).toContain("--tier");
    expect(stderr).toContain("DEPLOY_ENV");
  });

  it("resolves by DEPLOY_ENV without refusing, even with multiple tier files present", async () => {
    const { code, stdout, stderr } = await withEnv(
      ["node", "-e", "console.log('ok', process.env.TIER_MARK)"],
      { DEPLOY_ENV: "development" },
    );
    expect(stderr).not.toContain("multiple deploy tiers are present");
    expect(stderr).toContain("with-env: loaded");
    expect(stderr).toContain("(development)");
    expect(stdout).toBe("ok development\n");
    expect(code).toBe(0);
  });

  it("refuses an unrecognised --tier, naming the valid tiers", async () => {
    const { code, stdout, stderr } = await withEnv([
      "--tier",
      "bogus",
      "node",
      "-e",
      "0",
    ]);
    expect(code).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain('unknown tier "bogus"');
    expect(stderr).toContain("development");
    expect(stderr).toContain("staging");
    expect(stderr).toContain("production");
  });

  it("--tier wins over DEPLOY_ENV", async () => {
    const { code, stderr } = await withEnv(
      ["--tier", "development", "node", "-e", "0"],
      { DEPLOY_ENV: "bogus" },
    );
    expect(stderr).not.toContain("bogus");
    expect(stderr).toContain("(development)");
    expect(code).toBe(0);
  });

  it("loads the selected non-development tier's file, not development's", async () => {
    const { code, stdout, stderr } = await withEnv(
      ["--tier", "staging", "node", "-e", "console.log(process.env.TIER_MARK)"],
      {},
    );
    expect(stderr).toContain("(staging)");
    expect(stdout).toBe("staging\n");
    expect(code).toBe(0);
  });

  it("--tier stays a with-env option, out of the wrapped command's argv, and the positional boundary still passes through the wrapped command's own flags", async () => {
    // `node -e` treats a bare `--port 3001` after the script as ITS OWN
    // unrecognised flag (`node: bad option: --port`) unless a `--`
    // separator tells node's own parser to stop, at which point node's
    // `process.argv` starts from the first passthrough arg (index 1, not
    // the usual index 2) rather than an `[eval]` placeholder — both quirks
    // of `node -e`, nothing to do with `with-env`. What this test actually
    // exercises is commander's positional boundary: does `--tier` (before
    // the wrapped command) get consumed by with-env while `--port 3001`
    // (part of the wrapped command) reaches `node` untouched, the same way
    // `next dev --port 3001` needs `--port` to reach `next`, not `with-env`.
    const { code, stdout, stderr } = await withEnv([
      "--tier",
      "development",
      "node",
      "-e",
      "console.log(JSON.stringify(process.argv.slice(1)))",
      "--",
      "--port",
      "3001",
    ]);
    expect(code).toBe(0);
    expect(JSON.parse(stdout)).toEqual(["--port", "3001"]);
    expect(stderr).toContain("(development)");
  });
});
