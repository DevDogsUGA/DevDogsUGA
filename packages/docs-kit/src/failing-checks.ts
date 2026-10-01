/**
 * Wires `link-check.ts` and `command-check.ts` together for the bare mode:
 * gathers what each needs (the compiled pages, the workspace's own packages,
 * devtools' command catalog when it is reachable), runs both, and prints
 * anything either one found in the one shape `cli.ts` needs to decide an exit
 * code from.
 *
 * Both checks are content problems, not code problems, so neither one throws:
 * a page that cannot be parsed already failed earlier, inside
 * `emitDocsModule`. What reaches here are genuine broken links and commands,
 * and `cli.ts` is the only thing that gets to turn that into a failed build.
 */
import { checkCommands } from "./command-check.js";
import type { CommandCheckError } from "./command-check.js";
import { loadDevtoolsCommands } from "./devtools-catalog.js";
import { checkLinks } from "./link-check.js";
import type { LinkCheckError } from "./link-check.js";
import type { CompiledPage } from "./types.js";
import {
  appPackagesBySlug,
  discoverWorkspacePackages,
  findWorkspaceRoot,
  readRootPackage,
} from "./workspace.js";

export interface FailingChecksResult {
  linkErrors: LinkCheckError[];
  commandErrors: CommandCheckError[];
  /**
   * True when `pnpm devtools …` lines went unchecked because the devtools
   * catalog could not be loaded (see `devtools-catalog.ts`) — a silent skip
   * otherwise, since `commandErrors` looks identical to "every line was
   * checked and passed".
   */
  devtoolsCatalogMissing: boolean;
}

/**
 * `contentRoot` is where the bare mode is standing (normally `docs/`);
 * `pages` is what `compileDocs` just produced from it, mounting included.
 *
 * The workspace walk and the devtools catalog are both best-effort: a content
 * package built on its own, with no monorepo above it, has no workspace to
 * check `pnpm --filter`/`pnpm run` against and no devtools to check
 * `pnpm devtools` against, so both checks quietly narrow to whichever half
 * they can still answer rather than failing a build that has no way to know.
 */
export async function runFailingChecks(
  contentRoot: string,
  pages: readonly CompiledPage[],
): Promise<FailingChecksResult> {
  const linkErrors = checkLinks(pages);

  const repoRoot = findWorkspaceRoot(contentRoot);
  if (repoRoot === null) {
    return { linkErrors, commandErrors: [], devtoolsCatalogMissing: false };
  }

  const devtoolsCommands = await loadDevtoolsCommands(repoRoot);
  const packages = discoverWorkspacePackages(repoRoot);
  const commandErrors = checkCommands(pages, {
    devtoolsCommands,
    packages,
    appBySlug: appPackagesBySlug(packages),
    rootPackage: readRootPackage(repoRoot),
  });

  return {
    linkErrors,
    commandErrors,
    devtoolsCatalogMissing: devtoolsCommands === null,
  };
}

/** Prints every error found, `path:line: message`, and says how many. */
export function printFailingChecks(result: FailingChecksResult): void {
  const all = [...result.linkErrors, ...result.commandErrors];

  if (all.length > 0) {
    console.error(`[docs-kit] ${all.length} error(s):`);
    for (const error of all) {
      const at = error.line === null ? "" : `:${error.line}`;
      console.error(`[docs-kit] error: ${error.file}${at}: ${error.message}`);
    }
  }

  // Not an error — the check quietly narrows to link-checking alone whenever
  // devtools isn't installed/built next to this content (see
  // `devtools-catalog.ts`), which is correct in TASK-302's "pnpm dlx" world
  // but is otherwise indistinguishable from every `pnpm devtools` line
  // actually having been checked and passed. Said once so that silence is a
  // choice a reader can see, not a gap they have to already know about.
  if (result.devtoolsCatalogMissing) {
    console.error(
      '[docs-kit] notice: devtools catalog not found — "pnpm devtools …" commands were not checked',
    );
  }
}
