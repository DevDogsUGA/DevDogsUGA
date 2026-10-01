/**
 * Best-effort loader for `@devdogsuga/devtools`'s own command catalog, so
 * `command-check.ts` can validate a `pnpm devtools …` line without this
 * package depending on devtools or copying its command tree.
 *
 * FOLLOW-UP for the integrator, not a bug: `@devdogsuga/devtools` declares no
 * `exports` map (checked at the time of writing), so there is no published,
 * versioned surface to import this from. This reaches into its *built*
 * output — `node_modules/@devdogsuga/devtools/dist/commands.js`'s
 * `allPaths()`, the function that module's own header already calls out as
 * meant for "anything that wants to enumerate the CLI" — because that is the
 * only thing exposed today that does not require editing devtools, which
 * this task was scoped to avoid. It is deliberately quarantined to this one
 * file and one function so the real fix is a one-line swap: once devtools
 * ships a stable subpath export (or a `--help --json`), point
 * `loadDevtoolsCommands` at that instead of a `dist/` path.
 *
 * Every failure here — devtools not installed, not yet built (no `dist/`),
 * `allPaths` renamed or removed — resolves to `null`, and `command-check.ts`
 * treats `null` as "unknown", skipping `pnpm devtools` validation rather than
 * failing a build that cannot possibly answer the question. Nothing here
 * throws.
 */
import { existsSync } from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

const DEVTOOLS_ENTRY = "node_modules/@devdogsuga/devtools/dist/commands.js";

interface CommandsModule {
  allPaths?: () => string[][];
}

/**
 * Every devtools command path devtools currently declares, each one
 * space-joined (`"db migration new"`), intermediate group paths included —
 * or null when the catalog could not be loaded.
 */
export async function loadDevtoolsCommands(
  repoRoot: string,
): Promise<ReadonlySet<string> | null> {
  const entry = path.join(repoRoot, DEVTOOLS_ENTRY);
  if (!existsSync(entry)) return null;

  try {
    const mod = (await import(pathToFileURL(entry).href)) as CommandsModule;
    if (typeof mod.allPaths !== "function") return null;
    return new Set(mod.allPaths().map((commandPath) => commandPath.join(" ")));
  } catch {
    return null;
  }
}
