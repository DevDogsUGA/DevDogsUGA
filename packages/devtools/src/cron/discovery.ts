/**
 * Discovers each app's `CRON_ROUTES` (and optional `WORKFLOW_CRONS`) export by
 * dynamically importing its `cloudflare/scheduled.ts`. Mirrors the
 * env-discovery pattern: found by known path, zod-validated at the boundary. An
 * app without the file has no crons and is skipped; an app whose export fails
 * validation throws with the path.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseConfigFileTextToJson } from "typescript";
import { PROJECT_ROOT } from "../environment.js";
import {
  CronRoutes,
  WorkflowCrons,
  type CronRoutes as CronRoutesType,
  type WorkflowCrons as WorkflowCronsType,
} from "./schema.js";

export const CRON_TIERS = ["development", "staging", "production"] as const;
export type CronTier = (typeof CRON_TIERS)[number];

export interface WranglerWorkflow {
  binding: string;
  name: string;
  class_name?: string;
  schedules?: readonly string[];
}

export interface WranglerRoute {
  pattern?: string;
  custom_domain?: boolean;
}

export interface WranglerTierBlock {
  name?: string;
  triggers?: { crons?: readonly string[] };
  workflows?: readonly WranglerWorkflow[];
  routes?: readonly (string | WranglerRoute)[];
}

export interface WranglerConfig extends WranglerTierBlock {
  env?: Record<string, WranglerTierBlock | undefined>;
}

export interface AppWranglerConfig {
  app: string;
  path: string;
  config: WranglerConfig;
}

export function isCronTier(value: string): value is CronTier {
  return (CRON_TIERS as readonly string[]).includes(value);
}

/** Parse JSONC with TypeScript's production parser, preserving `//` in strings. */
export function parseWrangler(path: string): WranglerConfig {
  const result = parseConfigFileTextToJson(path, readFileSync(path, "utf8"));
  if (result.error) {
    throw new Error(`${path}: ${result.error.messageText}`);
  }
  return result.config as WranglerConfig;
}

export function blockForTier(
  config: WranglerConfig,
  tier: CronTier,
): WranglerTierBlock {
  return tier === "development" ? config : (config.env?.[tier] ?? {});
}

export function cronsForTier(config: WranglerConfig, tier: CronTier): string[] {
  return [...(blockForTier(config, tier).triggers?.crons ?? [])];
}

export function workflowsForTier(
  config: WranglerConfig,
  tier: CronTier,
): WranglerWorkflow[] {
  return [...(blockForTier(config, tier).workflows ?? [])];
}

/** Every app that actually carries a Wrangler configuration. */
export function discoverWranglerConfigs(): AppWranglerConfig[] {
  const appsRoot = join(PROJECT_ROOT, "apps");
  return readdirSync(appsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry): AppWranglerConfig[] => {
      const path = join(appsRoot, entry.name, "wrangler.jsonc");
      return existsSync(path)
        ? [{ app: entry.name, path, config: parseWrangler(path) }]
        : [];
    })
    .sort((a, b) => a.app.localeCompare(b.app));
}

export interface AppCronMap {
  app: string;
  /** Absolute path to the scheduled.ts file. */
  path: string;
  routes: CronRoutesType;
  /**
   * Workflow-backed schedules. `{}` for an app that exports no `WORKFLOW_CRONS`
   * (the common case — only schedule-builder has one today).
   */
  workflows: WorkflowCronsType;
}

/**
 * Imports every app's `cloudflare/scheduled.ts` and returns the parsed
 * `CRON_ROUTES` for each app that has one.
 *
 * `apps/sandbox` has no scheduled.ts and no crons; absent is not an error.
 */
export async function discoverCronMaps(): Promise<AppCronMap[]> {
  const results: AppCronMap[] = [];

  for (const { app } of discoverWranglerConfigs()) {
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

    // Optional: an app with no Workflow schedules omits the export entirely,
    // which parses as `{}`. A present-but-malformed export still fails closed.
    const parsedWorkflows = WorkflowCrons.safeParse(mod.WORKFLOW_CRONS ?? {});
    if (!parsedWorkflows.success) {
      throw new Error(
        `${scheduledPath}: WORKFLOW_CRONS does not match the required shape.\n` +
          parsedWorkflows.error.issues
            .map((i) => `  ${i.path.join(".")}: ${i.message}`)
            .join("\n"),
      );
    }

    results.push({
      app,
      path: scheduledPath,
      routes: parsed.data,
      workflows: parsedWorkflows.data,
    });
  }

  return results;
}
