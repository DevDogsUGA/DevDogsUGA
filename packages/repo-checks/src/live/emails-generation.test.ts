/**
 * Re-homed from `packages/devtools/src/emails/commands.test.ts` — only the
 * `describe("email preview generation")` block (the in-process
 * `parseEmailArgs`/`destination` argument-parsing tests stayed in Backstage;
 * those are pure functions over devtools' own arguments, not repo content).
 *
 * Rewritten as a black-box run of the installed `devtools` bin: devtools no
 * longer exports `generateEmails` (no `exports` map on the package at all —
 * only its two `bin`s are a real contract), and what this test actually
 * cares about is real-content round-tripping through the real, installed
 * CLI against this repo's real `@devdogsuga/email` templates (`"private":
 * true`, stays in DevDogsUGA — devtools loads it via its own
 * `repo/source.ts`).
 *
 * `--tier development:local` is required even though this command touches
 * no database — every `devtools` command resolves a session tier before
 * dispatch (confirmed empirically); `DEV_DB=local` disambiguates
 * `development` between the local Docker stack and a linked remote project.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { pnpmExec } from "./pnpm-exec.js";

let outDir: string | undefined;

afterEach(async () => {
  if (outDir) await rm(outDir, { recursive: true, force: true });
  outDir = undefined;
});

describe("email preview generation (via `devtools emails`)", () => {
  it("writes filled HTML and text for TeamInvite", async () => {
    outDir = await mkdtemp(join(tmpdir(), "devtools-emails-"));

    const result = await pnpmExec(
      "devtools",
      [
        "emails",
        "TeamInvite",
        "--format",
        "html,text",
        "--out",
        outDir,
        "--tier",
        "development:local",
      ],
      { DEV_DB: "local" },
    );

    expect(
      result.code,
      `devtools emails exited non-zero:\n${result.stderr}`,
    ).toBe(0);

    const html = await readFile(join(outDir, "TeamInvite.html"), "utf8");
    const text = await readFile(join(outDir, "TeamInvite.txt"), "utf8");
    expect(html).toContain("Byte Bulldogs");
    expect(text).toContain("Review the invitation");
  });
});
