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
  analyzeDocsReadiness,
  checkDocsReadiness,
  type DocsTree,
  type Readiness,
} from "./readiness.js";
import { renderBodyPlain } from "./render-plain.js";
import { checkTreeEntries, type UntrustedLimits } from "./untrusted-policy.js";

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
export { DocsBuildError } from "./errors.js";

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
 * Compiles `tree` for the live preview: the verdict, and the compiled project
 * whenever its pages compiled (even if links or structure still fail it).
 * Throws a `DocsBuildError` only if `tree.entries` break a tree rule, which a
 * caller that fetches files has already learned from `checkTreeEntries`.
 */
export function compilePreview(
  tree: DocsTree,
  options: PreviewOptions,
): ReturnType<typeof analyzeDocsReadiness> {
  return analyzeDocsReadiness(tree, { ...options, render: renderBodyPlain });
}
