/**
 * The one list of Worker apps, read from root `workers.json`.
 *
 * Six call sites across `devtools` and `env` used to carry their own copy of
 * `["platform", "sandbox", "schedule-builder"]` — a CLI's app-choice list, a
 * deploy guard, an env-registry consumer, a cron drift test, and more — with
 * nothing to say when one of them drifted from the rest. `workers.test.ts`
 * covers the drift; this module is the one place to fix it.
 */
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { PROJECT_ROOT } from "./environment.js";

/** Workspace-relative paths, exactly as listed in root `workers.json`. */
export const WORKER_PATHS: readonly string[] = JSON.parse(
  readFileSync(join(PROJECT_ROOT, "workers.json"), "utf8"),
) as readonly string[];

/** Basenames, e.g. `"schedule-builder"` — the `pnpm --filter` / CLI slug. */
export const WORKER_APPS: readonly string[] = WORKER_PATHS.map((path) =>
  basename(path),
);

export function isWorkerApp(value: string): boolean {
  return WORKER_APPS.includes(value);
}
