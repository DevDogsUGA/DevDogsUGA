import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const run = promisify(execFile);
const BIN = path.join(__dirname, "..", "bin", "docs-kit.mjs");

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-kit-readiness-"));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const write = (files: Record<string, string>): string => {
  for (const [rel, text] of Object.entries(files)) {
    const target = path.join(root, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
  }
  return root;
};

const readiness = (...args: string[]) =>
  run("node", [BIN, "readiness", ...args]).then(
    (done) => ({ code: 0, out: done.stdout, err: done.stderr }),
    (error: { code: number; stdout: string; stderr: string }) => ({
      code: error.code,
      out: error.stdout,
      err: error.stderr,
    }),
  );

describe("docs-kit readiness <dir>", () => {
  it("exits 0 and says how much it read when the folder is ready", async () => {
    const dir = write({
      "index.md": "# Demo\n\n[guide](./guide.md)\n",
      "guide.md": "# Guide\n\ntext\n",
    });
    const result = await readiness(dir);
    expect(result.code).toBe(0);
    expect(result.out).toContain("ready: 2 page(s), 0 image(s)");
  }, 60_000);

  it("exits 1 and prints each problem with its file", async () => {
    const dir = write({ "index.md": "# Demo\n\n[gone](./missing.md)\n" });
    const result = await readiness(dir);
    expect(result.code).toBe(1);
    expect(result.err).toContain("1 problem(s)");
    expect(result.err).toContain("index.md:3: links to");
  }, 60_000);

  it("prints the verdict as JSON for a caller to format", async () => {
    const dir = write({ "guide.md": "# Guide\n\ntext\n" });
    const result = await readiness(dir, "--json");
    expect(result.code).toBe(1);
    const verdict = JSON.parse(result.out.trim()) as {
      ready: boolean;
      problems: { kind: string; message: string }[];
    };
    expect(verdict.ready).toBe(false);
    expect(verdict.problems[0]).toMatchObject({ kind: "structure" });
    expect(verdict.problems[0]!.message).toContain("add index.md");
  }, 60_000);

  it("asks for a folder, and says a missing one is a problem rather than crashing", async () => {
    expect((await readiness()).code).toBe(1);
    const missing = await readiness(path.join(root, "nope"), "--json");
    expect(missing.code).toBe(1);
    expect(missing.out).toContain("doesn't exist");
  }, 60_000);
});
