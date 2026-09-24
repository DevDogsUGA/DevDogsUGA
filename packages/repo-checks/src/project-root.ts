/**
 * This repo's root, for tests that read real repo files (workers.json,
 * .github/workflows/*.yaml, apps/*, packages/*) or spawn the installed
 * devtools/devtools-ci bins against the real checkout.
 *
 * `packages/repo-checks/src/project-root.ts` -> repo root is two levels up.
 * Deliberately NOT devtools' own `findRepoRoot()` (walks up looking for
 * `pnpm-workspace.yaml` + `package.json.name === "devdogs-monorepo"`) —
 * that function isn't part of `@devdogsuga/devtools`' published surface
 * (no `exports` map; see this package's README for why these tests don't
 * reach into devtools internals), and this package doesn't need the general
 * case: it always runs from this fixed location in this one repo.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const PROJECT_ROOT: string = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);
