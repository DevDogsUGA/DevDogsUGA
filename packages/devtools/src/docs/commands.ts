/**
 * `devtools docs check [<folder>]`.
 *
 * Prints what the docs-publishing build would refuse, one problem per line
 * with its file, on stderr when there are any (a CI log reads the same with or
 * without a terminal), and exits 1; a ready folder prints one line and exits 0.
 * See `check.ts` for where the rules live.
 */
import { spawn } from "node:child_process";
import { DONE, type CommandHandler } from "@devdogsuga/cli-core/dispatch";
import { resolveLayout } from "@devdogsuga/cli-core/repo/layout";
import { catalog } from "../catalog.js";
import {
  describeVerdict,
  docsFolder,
  docsKitBin,
  parseVerdict,
  type DocsKitRun,
} from "./check.js";

/** Runs docs-kit's `readiness` and collects what it printed. */
function runDocsKit(bin: string, folder: string): Promise<DocsKitRun> {
  return new Promise((resolvePromise) => {
    const child = spawn(
      process.execPath,
      [bin, "readiness", folder, "--json"],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("error", (error) =>
      resolvePromise({ code: 1, stdout, stderr: String(error) }),
    );
    child.on("close", (code) =>
      resolvePromise({ code: code ?? 1, stdout, stderr }),
    );
  });
}

export interface DocsDeps {
  run: (bin: string, folder: string) => Promise<DocsKitRun>;
  cwd: () => string;
}

const defaultDeps: DocsDeps = { run: runDocsKit, cwd: () => process.cwd() };

function fail(message: string): number {
  process.stderr.write(`docs check: ${message}\n`);
  return 1;
}

async function check(rest: string[], deps: DocsDeps): Promise<number> {
  const named = rest.find((arg) => !arg.startsWith("-"));
  const layout = resolveLayout();
  const folder = docsFolder(named, layout, deps.cwd());
  if ("error" in folder) return fail(folder.error);

  const bin = docsKitBin(layout.devdogsugaRoot);
  if (bin === null) {
    return fail(
      `docs-kit isn't in the DevDogsUGA checkout at ${layout.devdogsugaRoot}. Run \`pnpm install\` there (or \`pnpm devdogsuga\` to link it).`,
    );
  }
  const ran = await deps.run(bin, folder.dir);
  const verdict = parseVerdict(ran.stdout);
  if (verdict === null) {
    return fail(
      `docs-kit didn't answer${ran.stderr.trim() === "" ? "" : `:\n${ran.stderr.trim()}`}`,
    );
  }
  const said = describeVerdict(verdict);
  process.stdout.write(said.stdout);
  process.stderr.write(said.stderr);
  return said.code;
}

export function createDocsHandler(
  deps: DocsDeps = defaultDeps,
): CommandHandler {
  return async (rest) => {
    let code: number;
    try {
      const [sub, ...args] = rest;
      if (sub === "check") code = await check(args, deps);
      else {
        process.stderr.write(
          sub
            ? `devtools docs: unknown command "${sub}". Try ${catalog.subcommandList(["docs"])}.\n`
            : `devtools docs: which of ${catalog.subcommandList(["docs"])}?\n`,
        );
        code = 1;
      }
    } catch (err) {
      // A missing checkout or an unreadable folder is a failed check, not a crash.
      code = fail(err instanceof Error ? err.message : String(err));
    }
    process.exitCode = code;
    return code === 0 ? DONE : null;
  };
}

export const handleDocs: CommandHandler = createDocsHandler();
