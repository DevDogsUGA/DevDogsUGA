/**
 * `checkDocsReadiness` for a folder on disk, with Shiki: what
 * `devtools docs check` runs, and the same answer the candidate build gives
 * for the same folder. Node only: it reads the file system and loads the
 * highlighter, so the platform's Worker uses `preview.ts` instead.
 */
import { DocsBuildError } from "./errors.js";
import { checkDocsReadiness, type Readiness } from "./readiness.js";
import { renderBody } from "./render.js";
import { scanUntrustedDocs } from "./untrusted.js";
import type { UntrustedLimits } from "./untrusted-policy.js";

export interface DirReadinessOptions {
  /** The slug the pages compile under. It only prefixes ids; defaults to `docs`. */
  project?: string;
  limits?: Partial<UntrustedLimits>;
}

export async function checkDocsDirReadiness(
  docsDir: string,
  options: DirReadinessOptions = {},
): Promise<Readiness> {
  let files;
  try {
    files = scanUntrustedDocs(docsDir, options.limits);
  } catch (error) {
    if (!(error instanceof DocsBuildError)) throw error;
    return {
      ready: false,
      problems: [{ kind: "structure", file: null, message: error.message }],
      pages: 0,
      assets: 0,
    };
  }
  return checkDocsReadiness(
    { files: new Map(files.map((f) => [f.rel, f.bytes])) },
    {
      project: options.project ?? "docs",
      render: renderBody,
      ...(options.limits ? { limits: options.limits } : {}),
    },
  );
}
