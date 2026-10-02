/**
 * Wires `link-check.ts` and `command-check.ts` together for the bare mode:
 * gathers what each needs (the compiled pages, the workspace's own packages,
 * the command lists of devtools and backstage), runs both, and prints
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
import { loadCliCommands } from "./cli-catalog.js";
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
   * Why a CLI's command list could not be loaded (see `cli-catalog.ts`). These
   * fail the build like any other error: without the list, `commandErrors`
   * would look identical to "every line was checked and passed".
   */
  catalogErrors: string[];
}

/**
 * `contentRoot` is where the bare mode is standing (normally `docs/`);
 * `pages` is what `compileDocs` just produced from it, mounting included.
 *
 * With no monorepo above the content (a package built on its own) there is
 * no workspace to check `pnpm --filter`/`pnpm run` against and no CLIs to ask,
 * so only the links are checked. Inside a monorepo nothing is best-effort: a
 * command list that cannot be loaded is reported in `catalogErrors`.
 */
export async function runFailingChecks(
  contentRoot: string,
  pages: readonly CompiledPage[],
): Promise<FailingChecksResult> {
  const linkErrors = checkLinks(pages);

  const repoRoot = findWorkspaceRoot(contentRoot);
  if (repoRoot === null) {
    return { linkErrors, commandErrors: [], catalogErrors: [] };
  }

  const [devtools, backstage] = await Promise.allSettled([
    loadCliCommands(repoRoot, "devtools"),
    loadCliCommands(repoRoot, "backstage"),
  ]);
  const catalogErrors = [devtools, backstage].flatMap((result) =>
    result.status === "rejected"
      ? [
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason),
        ]
      : [],
  );
  if (devtools.status === "rejected" || backstage.status === "rejected") {
    return { linkErrors, commandErrors: [], catalogErrors };
  }

  const packages = discoverWorkspacePackages(repoRoot);
  const commandErrors = checkCommands(pages, {
    devtoolsCommands: devtools.value,
    backstageCommands: backstage.value,
    packages,
    appBySlug: appPackagesBySlug(packages),
    rootPackage: readRootPackage(repoRoot),
  });

  return {
    linkErrors,
    commandErrors,
    catalogErrors,
  };
}

/** Prints every error found, `path:line: message`, and says how many. */
export function printFailingChecks(result: FailingChecksResult): void {
  const all = [...result.linkErrors, ...result.commandErrors];
  const count = all.length + result.catalogErrors.length;

  if (count > 0) {
    console.error(`[docs-kit] ${count} error(s):`);
    for (const error of all) {
      const at = error.line === null ? "" : `:${error.line}`;
      console.error(`[docs-kit] error: ${error.file}${at}: ${error.message}`);
    }
    for (const message of result.catalogErrors) {
      console.error(`[docs-kit] error: ${message}`);
    }
  }
}
