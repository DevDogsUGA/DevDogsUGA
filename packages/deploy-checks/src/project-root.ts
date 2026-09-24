/**
 * This repo's root, for config.test.ts's structural checks against real
 * `wrangler.jsonc`/`middleware.ts` files. Duplicated from
 * packages/repo-checks/src/project-root.ts rather than imported -- that
 * package is test-only itself (see its own package.json description) and
 * nothing in the workspace is meant to import across sibling "checks"
 * packages; see that file's header for why devtools' own `findRepoRoot()`
 * isn't the answer either.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const PROJECT_ROOT: string = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);
