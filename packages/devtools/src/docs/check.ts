/**
 * `devtools docs check`: is a project's `docs/` folder ready to publish?
 *
 * The rules are not written here. They are docs-kit's readiness check, the
 * code the docs-publishing build calls for its own checks, run from the
 * DevDogsUGA checkout (`resolveLayout().devdogsugaRoot`): a project is judged
 * by the compiler its candidates are built with, and this package carries no
 * copy of it. What lives here is finding the folder, finding that checkout,
 * running `docs-kit readiness <folder> --json`, and saying what it found.
 *
 * The functions are pure or take their runner, so every case is a test.
 */
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

/** The verdict `docs-kit readiness --json` prints. */
export interface DocsVerdict {
  ready: boolean;
  problems: { kind: string; file: string | null; message: string }[];
  pages: number;
  assets: number;
}

/** docs-kit's bin, inside a DevDogsUGA checkout. */
export const DOCS_KIT_BIN = join("packages", "docs-kit", "bin", "docs-kit.mjs");

/**
 * The folder to check: the one named, or `docs/` at the root of the repo being
 * run from. DevDogsUGA's own `docs/` is the club's (one folder per project,
 * with `_shared` pages), which is not a project's docs, so it is only checked
 * when named.
 */
export function docsFolder(
  named: string | undefined,
  repo: { kind: string; root: string },
  cwd: string,
): { dir: string } | { error: string } {
  if (named !== undefined) return { dir: resolve(cwd, named) };
  if (repo.kind === "devdogsuga") {
    return {
      error:
        "this is the DevDogsUGA repository, whose docs/ holds the club's own docs, built by `docs-kit`. Name a project's docs folder: `devtools docs check <folder>`.",
    };
  }
  return { dir: join(repo.root, "docs") };
}

/** The docs-kit bin in `devdogsugaRoot`, or null when the checkout has none. */
export function docsKitBin(devdogsugaRoot: string): string | null {
  const bin = join(devdogsugaRoot, DOCS_KIT_BIN);
  return existsSync(bin) ? bin : null;
}

/** What a run of docs-kit left: its exit code and what it printed. */
export interface DocsKitRun {
  code: number;
  stdout: string;
  stderr: string;
}

/** The verdict in `stdout`, or null when it is not one. */
export function parseVerdict(stdout: string): DocsVerdict | null {
  let value: unknown;
  try {
    value = JSON.parse(stdout.trim().split("\n").at(-1) ?? "");
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const verdict = value as Partial<DocsVerdict>;
  return typeof verdict.ready === "boolean" &&
    Array.isArray(verdict.problems) &&
    typeof verdict.pages === "number" &&
    typeof verdict.assets === "number"
    ? (verdict as DocsVerdict)
    : null;
}

/** What `docs check` prints, and the exit code it ends with. */
export function describeVerdict(verdict: DocsVerdict): {
  code: number;
  stdout: string;
  stderr: string;
} {
  if (verdict.ready) {
    const images = `${verdict.assets} image${verdict.assets === 1 ? "" : "s"}`;
    return {
      code: 0,
      stdout: `docs check: ready (${verdict.pages} page${verdict.pages === 1 ? "" : "s"}, ${images}).\n`,
      stderr: "",
    };
  }
  const n = verdict.problems.length;
  return {
    code: 1,
    stdout: "",
    stderr:
      `docs check: ${n} problem${n === 1 ? "" : "s"}\n` +
      verdict.problems
        .map((p) => `  ${p.file === null ? "" : `${p.file}: `}${p.message}\n`)
        .join(""),
  };
}
