/**
 * The part of docs-kit that runs in the platform's Worker: compile a project's
 * docs from files already in memory, and say whether they are ready to publish.
 *
 * Everything reachable from this file is free of `node:fs` and of Shiki. Shiki's
 * Oniguruma engine compiles WebAssembly at run time and the Workers runtime
 * forbids that, so code blocks are rendered framed but uncoloured
 * (`plain-code.ts`); every other rule is the one the candidate build applies,
 * because it is the same code (`untrusted-policy.ts`, `readiness.ts`).
 * `preview-graph.test.ts` fails if an import ever drags either back in.
 */
import {
  checkDocsReadiness,
  type DocsTree,
  type Readiness,
} from "./readiness.js";
import { renderBodyPlain } from "./render-plain.js";
import {
  analyzeUntrustedFiles,
  checkTreeEntries,
  type TreeEntry,
  type UntrustedAnalysis,
  type UntrustedFile,
  type UntrustedLimits,
} from "./untrusted-policy.js";

export type {
  DocsTree,
  Readiness,
  ReadinessKind,
  ReadinessProblem,
} from "./readiness.js";
export {
  DEFAULT_UNTRUSTED_LIMITS,
  type TreeEntry,
  type UntrustedCompileResult,
  type UntrustedLimits,
} from "./untrusted-policy.js";
export type { DocsPage } from "./types.js";
export { checkTreeEntries };

export interface PreviewOptions {
  /** The slug the pages are compiled under. */
  project: string;
  limits?: Partial<UntrustedLimits>;
}

/** Whether `tree` is ready to publish, by the candidate build's rules. */
export function checkPreviewReadiness(
  tree: DocsTree,
  options: PreviewOptions,
): Promise<Readiness> {
  return checkDocsReadiness(tree, { ...options, render: renderBodyPlain });
}

/**
 * Compiles `tree` for the live preview. `entries` must already have passed
 * `checkTreeEntries` (the caller needs its answer to know which files to
 * fetch). Returns what was refused, or the compiled project.
 */
export async function compilePreview(
  tree: {
    entries: readonly TreeEntry[];
    files: ReadonlyMap<string, Uint8Array>;
  },
  options: PreviewOptions,
): Promise<UntrustedAnalysis> {
  const kinds = checkTreeEntries(tree.entries, options.limits);
  const files: UntrustedFile[] = [];
  for (const [rel, kind] of kinds) {
    const bytes = tree.files.get(rel);
    if (bytes === undefined) {
      return {
        result: null,
        problems: [
          {
            file: rel,
            message: `${rel}: was listed but its contents are missing`,
          },
        ],
      };
    }
    files.push({ rel, kind, bytes });
  }
  return analyzeUntrustedFiles(files, options, renderBodyPlain);
}
