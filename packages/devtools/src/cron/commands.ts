/**
 * `devtools cron list` and `devtools cron run`.
 *
 * `cron list` reconciles each app's Worker `triggers.crons` and native
 * `workflows[].schedules` (per tier) against its `CRON_ROUTES` and
 * `WORKFLOW_CRONS` exports and surfaces every
 * failure shape:
 *   - a Worker cron matching no route map → fires nothing
 *   - a CRON_ROUTES / WORKFLOW_CRONS key no tier schedules → never fires
 *   - a WORKFLOW_CRONS key whose binding that tier's wrangler never declares →
 *     misconfigured
 *
 * `cron run` selects route-backed schedules from the same maps and sends their
 * authenticated GETs sequentially, mirroring `cloudflare/scheduled.ts`.
 * Workflow-backed schedules stay visible in the audit but are triggered by the
 * separate `devtools workflows` command, which reads Wrangler bindings directly.
 *
 * The local run path pre-flights the target origin and, if nothing is
 * listening, prints a tailored hint rather than a raw ECONNREFUSED.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { confirm, select } from "@clack/prompts";
import { parse as parseEnv } from "dotenv";
import { fileFor, type EnvTarget } from "@devdogsuga/env";
import { PROJECT_ROOT } from "../environment.js";
import { positionals } from "../args.js";
import { unwrap } from "../ui.js";
import {
  CRON_TIERS,
  cronsForTier,
  discoverCronMaps,
  discoverWranglerConfigs,
  isCronTier,
  workflowsForTier,
  type AppCronMap,
  type CronTier,
  type WranglerConfig,
} from "./discovery.js";

// ── origin reachability ───────────────────────────────────────────────────────

/**
 * Whether *something* answers at `url`'s origin. Any HTTP reply — even 404 or
 * 405 — means a server is listening; only a transport failure (ECONNREFUSED, a
 * dead host, a DNS miss) counts as unreachable. The short timeout keeps a
 * black-hole host from hanging the command; a refused connection returns
 * immediately regardless.
 */
export async function originReachable(
  url: string,
  timeoutMs = 2500,
): Promise<boolean> {
  try {
    const origin = new URL(url).origin;
    await fetch(origin, {
      method: "HEAD",
      signal: AbortSignal.timeout(timeoutMs),
    });
    return true;
  } catch {
    return false;
  }
}

// ── Human-readable schedule translator ───────────────────────────────────────

function describeExpr(expr: string): string {
  let m: RegExpExecArray | null;
  if (/^0 0 \* \* \*$/.test(expr)) return "daily at midnight UTC";
  if ((m = /^\*\/(\d+) \* \* \* \*$/.exec(expr)))
    return `every ${m[1]} minutes (UTC)`;
  if ((m = /^(\d+) (\d+) \* \* \*$/.exec(expr))) {
    const hh = m[2]!.padStart(2, "0");
    const mm = m[1]!.padStart(2, "0");
    return `daily at ${hh}:${mm} UTC`;
  }
  return expr;
}

// ── cron list ─────────────────────────────────────────────────────────────────

interface CronListOptions {
  app?: string;
  tier?: string;
  json?: boolean;
}

export interface CronListRow {
  app: string;
  tier: string;
  expr: string;
  human: string;
  label: string;
  kind: "route" | "workflow";
  /** Routes fired (route kind); empty for a workflow row. */
  routes: string[];
  /** Workflows binding started (workflow kind). */
  binding?: string;
  /** The tier's wrangler workflow name for that binding, when declared. */
  workflowName?: string;
  status: "ok" | "never-fires" | "fires-nothing" | "misconfigured";
}

/**
 * Reconciles one app's `CRON_ROUTES` + `WORKFLOW_CRONS` against its Worker and
 * Workflow schedules for each tier. Pure — it takes the already-read wrangler
 * config — so the table is unit-tested without touching the filesystem.
 *
 * A workflow schedule is `ok` only when the tier declares the binding named by
 * the map and that binding natively schedules the expression.
 */
export function reconcileMap(
  map: AppCronMap,
  config: WranglerConfig,
  tiers: readonly CronTier[],
): CronListRow[] {
  const rows: CronListRow[] = [];
  const routeExprs = new Set(Object.keys(map.routes));
  const workflowExprs = new Set(Object.keys(map.workflows));

  for (const tier of tiers) {
    const workerScheduled = new Set(cronsForTier(config, tier));
    const boundWorkflows = new Map(
      workflowsForTier(config, tier).map((w) => [w.binding, w]),
    );

    for (const expr of routeExprs) {
      const entry = map.routes[expr]!;
      rows.push({
        app: map.app,
        tier,
        expr,
        human: describeExpr(expr),
        label: entry.label,
        kind: "route",
        routes: entry.routes,
        status: workerScheduled.has(expr) ? "ok" : "never-fires",
      });
    }

    for (const expr of workflowExprs) {
      const entry = map.workflows[expr]!;
      const workflow = boundWorkflows.get(entry.binding);
      const workflowName = workflow?.name;
      const status =
        workflow === undefined
          ? "misconfigured"
          : workflow.schedules?.includes(expr)
            ? "ok"
            : "never-fires";
      rows.push({
        app: map.app,
        tier,
        expr,
        human: describeExpr(expr),
        label: entry.label,
        kind: "workflow",
        routes: [],
        binding: entry.binding,
        workflowName,
        status,
      });
    }

    for (const expr of workerScheduled) {
      if (!routeExprs.has(expr)) {
        rows.push({
          app: map.app,
          tier,
          expr,
          human: describeExpr(expr),
          label: "(no CRON_ROUTES or WORKFLOW_CRONS entry)",
          kind: "route",
          routes: [],
          status: "fires-nothing",
        });
      }
    }
  }

  return rows;
}

export async function runCronList(argv: readonly string[]): Promise<number> {
  const opts = parseCronListOptions(argv);
  if (opts.tier && !isCronTier(opts.tier)) {
    process.stderr.write(
      `devtools cron list: unknown tier "${opts.tier}". Expected: ${CRON_TIERS.join(", ")}.\n`,
    );
    return 1;
  }
  const maps = await discoverCronMaps();
  const configs = new Map(
    discoverWranglerConfigs().map(({ app, config }) => [app, config]),
  );

  const appMaps = opts.app ? maps.filter((m) => m.app === opts.app) : maps;

  if (opts.app && appMaps.length === 0) {
    process.stderr.write(
      `devtools cron list: no cron map found for app "${opts.app}".\n`,
    );
    return 1;
  }

  const tiers: CronTier[] = opts.tier
    ? [opts.tier as CronTier]
    : [...CRON_TIERS];

  const rows = appMaps.flatMap((map) => {
    const config = configs.get(map.app);
    if (!config) throw new Error(`${map.app}: wrangler.jsonc is missing`);
    return reconcileMap(map, config, tiers);
  });

  if (opts.json) {
    console.log(JSON.stringify(rows, null, 2));
    return 0;
  }

  renderCronList(rows);
  return 0;
}

function renderCronList(rows: CronListRow[]): void {
  let currentApp = "";
  let currentTier = "";

  for (const row of rows) {
    if (row.app !== currentApp || row.tier !== currentTier) {
      currentApp = row.app;
      currentTier = row.tier;
      console.log(`\n${row.app}  [${row.tier}]`);
    }

    const warn =
      row.status === "never-fires"
        ? "  ⚠  never fires (no wrangler schedule)"
        : row.status === "fires-nothing"
          ? "  ⚠  fires nothing (no CRON_ROUTES or WORKFLOW_CRONS entry)"
          : row.status === "misconfigured"
            ? `  ⚠  misconfigured (no "${row.binding}" workflow bound in this tier)`
            : "";

    console.log(`  ${row.expr.padEnd(18)}  ${row.human}`);
    console.log(`    ${row.label}${warn}`);
    if (row.kind === "workflow") {
      const named = row.workflowName ? ` (${row.workflowName})` : "";
      console.log(`    → workflow: ${row.binding}${named}`);
    }
    for (const route of row.routes) console.log(`    ${route}`);
  }

  if (rows.length === 0) console.log("(no cron maps found)");
}

function parseCronListOptions(argv: readonly string[]): CronListOptions {
  const opts: CronListOptions = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--app") opts.app = argv[i + 1];
    else if (argv[i] === "--tier") opts.tier = argv[i + 1];
    else if (argv[i] === "--json") opts.json = true;
  }
  return opts;
}

// ── cron run ──────────────────────────────────────────────────────────────────

interface CronRunOptions {
  app?: string;
  tier?: string;
  cron?: string;
  yes?: boolean;
}

export interface CronChoice {
  app: string;
  expr: string;
  label: string;
  routes: string[];
  scheduled: boolean;
}

/** Runnable route schedules, including intentionally unscheduled manual jobs. */
export function cronChoices(
  maps: readonly AppCronMap[],
  configs: ReadonlyMap<string, WranglerConfig>,
  tier: CronTier,
  app?: string,
): CronChoice[] {
  return maps
    .filter((map) => !app || map.app === app)
    .flatMap((map) => {
      const scheduled = new Set(cronsForTier(configs.get(map.app) ?? {}, tier));
      return Object.entries(map.routes).map(([expr, entry]) => ({
        app: map.app,
        expr,
        label: entry.label,
        routes: entry.routes,
        scheduled: scheduled.has(expr),
      }));
    })
    .sort((a, b) => a.app.localeCompare(b.app) || a.expr.localeCompare(b.expr));
}

async function resolveTier(
  given: string | undefined,
): Promise<CronTier | null> {
  if (given) {
    if (isCronTier(given)) return given;
    process.stderr.write(
      `devtools cron run: unknown tier "${given}". Expected: ${CRON_TIERS.join(", ")}.\n`,
    );
    return null;
  }
  if (!process.stdin.isTTY) return "development";
  return unwrap(
    await select<CronTier>({
      message: "Which tier should receive the cron job?",
      options: CRON_TIERS.map((value) => ({
        value,
        hint:
          value === "development"
            ? "this machine"
            : value === "production"
              ? "⚠️  live data"
              : undefined,
      })),
    }),
  );
}

async function confirmDeployed(
  tier: CronTier,
  choice: CronChoice | undefined,
  yes: boolean,
): Promise<boolean> {
  if (tier === "development" || yes) return true;
  if (!process.stdin.isTTY) {
    process.stderr.write(
      `devtools cron run: --yes is required to fire a job on ${tier}.\n`,
    );
    return false;
  }
  return unwrap(
    await confirm({
      message: `Fire ${choice?.label ?? "this cron job"} on ${tier}?`,
      initialValue: false,
    }),
  );
}

export async function runCronRun(argv: readonly string[]): Promise<number> {
  const opts = parseCronRunOptions(argv);
  const route = positionals(argv)[0];
  const tier = await resolveTier(opts.tier);
  if (!tier) return 1;

  const maps = await discoverCronMaps();
  const discovered = discoverWranglerConfigs();
  const configs = new Map(discovered.map(({ app, config }) => [app, config]));
  const choices = cronChoices(maps, configs, tier, opts.app);
  let choice: CronChoice | undefined;

  if (opts.cron) {
    const matches = choices.filter((item) => item.expr === opts.cron);
    if (matches.length > 1 && !opts.app) {
      process.stderr.write(
        `devtools cron run: "${opts.cron}" exists in more than one app; pass --app.\n`,
      );
      return 1;
    }
    choice = matches[0];
  } else if (!route) {
    if (choices.length === 0) {
      process.stderr.write(
        "devtools cron run: no route cron jobs were discovered.\n",
      );
      return 1;
    }
    if (!process.stdin.isTTY) {
      process.stderr.write(
        "devtools cron run: pass --cron <expr> (and --app when needed) when no terminal is available.\n",
      );
      return 1;
    }
    choice = unwrap(
      await select<CronChoice>({
        message: "Which cron job should run?",
        options: choices.map((item) => ({
          value: item,
          label: `${item.app} · ${item.label}`,
          hint: `${item.expr} · ${item.scheduled ? "scheduled" : `manual only on ${tier}`}`,
        })),
      }),
    );
  }

  if (!route && !choice) {
    const workflow = maps.some(
      (map) => (!opts.app || map.app === opts.app) && map.workflows[opts.cron!],
    );
    process.stderr.write(
      workflow
        ? `devtools cron run: "${opts.cron}" starts a Workflow; use devtools workflows run.\n`
        : `devtools cron run: no route job found for "${opts.cron}".\n`,
    );
    return 1;
  }

  if (!(await confirmDeployed(tier, choice, opts.yes ?? false))) return 1;

  const app = choice?.app ?? opts.app;
  const tierEnv = loadTierEnv(tier);
  const baseUrl = resolveBaseUrl(app, tier, configs.get(app ?? ""), tierEnv);
  const cronSecret = tierEnv["CRON_SECRET"] ?? "";
  const routes = choice?.routes ?? [route!];

  // Pre-flight: on a local tier, a refused connection means the dev server
  // isn't up — not that a route is broken. Say so, with the command to start
  // it, instead of failing every route with a raw ECONNREFUSED.
  if (tier === "development" && !(await originReachable(baseUrl))) {
    process.stderr.write(devServerHint(app, baseUrl));
    return 1;
  }

  let failed = false;
  for (const r of routes) {
    const url = new URL(r, `${baseUrl.replace(/\/+$/, "")}/`).toString();
    process.stdout.write(`→ ${url}\n`);
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${cronSecret}` },
      });
      if (!response.ok) {
        process.stderr.write(`  ${r}: HTTP ${response.status}\n`);
        failed = true;
      } else {
        process.stdout.write(`  ${r}: OK\n`);
      }
    } catch (err) {
      process.stderr.write(
        `  ${r}: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      failed = true;
    }
  }

  return failed ? 1 : 0;
}

function readEnvFile(path: string): Record<string, string> {
  return existsSync(path) ? parseEnv(readFileSync(path, "utf8")) : {};
}

/** Resolve the selected app's origin without assuming every app uses port 3000. */
export function resolveBaseUrl(
  app: string | undefined,
  tier: CronTier,
  config: WranglerConfig | undefined,
  tierEnv: Record<string, string>,
): string {
  if (tier === "development" && app) {
    const appRoot = join(PROJECT_ROOT, "apps", app);
    const local = {
      ...readEnvFile(join(appRoot, ".dev.vars.example")),
      ...readEnvFile(join(appRoot, ".dev.vars")),
    };
    if (local["BASE_URL"]) return local["BASE_URL"];
  }

  if (tier !== "development" && config) {
    const route = (config.env?.[tier]?.routes ?? []).find((candidate) => {
      const pattern =
        typeof candidate === "string" ? candidate : candidate.pattern;
      return Boolean(pattern && !pattern.includes("*"));
    });
    const pattern = typeof route === "string" ? route : route?.pattern;
    if (pattern) return `https://${pattern.replace(/\/\*$/, "")}`;
  }

  return tierEnv["BASE_URL"] ?? "http://localhost:3000";
}

// ── not-running hints ─────────────────────────────────────────────────────────

export function devServerHint(
  app: string | undefined,
  baseUrl: string,
): string {
  const filter = app ? `--filter ${app}` : "--filter <app>";
  return (
    `devtools cron run: nothing is listening at ${new URL(baseUrl).origin}.\n` +
    "The dev server doesn't appear to be running. Start it, then re-run:\n" +
    `  pnpm ${filter} dev\n`
  );
}

// ── tier env loader ───────────────────────────────────────────────────────────

// exported for unit testing; reads the tier's .env.<tier> file from PROJECT_ROOT
export function loadTierEnv(tier: string): Record<string, string> {
  const validTiers: readonly string[] = [
    "development",
    "preflight",
    "staging",
    "production",
  ];
  const safeTarget: EnvTarget = validTiers.includes(tier)
    ? (tier as EnvTarget)
    : "development";
  const filename = fileFor(safeTarget);
  const envPath = join(PROJECT_ROOT, filename);
  if (!existsSync(envPath)) return {};
  return parseEnv(readFileSync(envPath, "utf8"));
}

function parseCronRunOptions(argv: readonly string[]): CronRunOptions {
  const opts: CronRunOptions = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--app") opts.app = argv[i + 1];
    else if (argv[i] === "--tier") opts.tier = argv[i + 1];
    else if (argv[i] === "--cron") opts.cron = argv[i + 1];
    else if (argv[i] === "--yes") opts.yes = true;
  }
  return opts;
}
