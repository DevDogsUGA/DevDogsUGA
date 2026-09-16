/**
 * Discovers each app's `CRON_ROUTES` export by dynamically importing its
 * `cloudflare/scheduled.ts`. Mirrors the env-discovery pattern: found by known
 * path, zod-validated at the boundary. An app without the file has no crons
 * and is skipped; an app whose export fails validation throws with the path.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { PROJECT_ROOT } from "../environment.js";
import { CronRoutes, type CronRoutes as CronRoutesType } from "./schema.js";

const APPS_WITH_CRONS = ["platform", "schedule-builder"] as const;

export interface AppCronMap {
  app: string;
  /** Absolute path to the scheduled.ts file. */
  path: string;
  routes: CronRoutesType;
}

/**
 * Imports every app's `cloudflare/scheduled.ts` and returns the parsed
 * `CRON_ROUTES` for each app that has one.
 *
 * `apps/sandbox` has no scheduled.ts and no crons; absent is not an error.
 */
export async function discoverCronMaps(): Promise<AppCronMap[]> {
  const results: AppCronMap[] = [];

  for (const app of APPS_WITH_CRONS) {
    const scheduledPath = join(
      PROJECT_ROOT,
      "apps",
      app,
      "cloudflare",
      "scheduled.ts",
    );

    if (!existsSync(scheduledPath)) continue;

    const mod = await import(pathToFileURL(scheduledPath).href);
    const parsed = CronRoutes.safeParse(mod.CRON_ROUTES);
    if (!parsed.success) {
      throw new Error(
        `${scheduledPath}: CRON_ROUTES does not match the required shape.\n` +
          parsed.error.issues
            .map((i) => `  ${i.path.join(".")}: ${i.message}`)
            .join("\n"),
      );
    }

    results.push({ app, path: scheduledPath, routes: parsed.data });
  }

  return results;
}
