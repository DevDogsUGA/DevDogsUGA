/**
 * `devtools cron list` and `devtools cron run`
 *
 * `cron list` reconciles each app's `wrangler.jsonc triggers.crons` (per tier)
 * against its `CRON_ROUTES` export and surfaces both failure shapes:
 *   - a wrangler schedule with no CRON_ROUTES key → fires nothing
 *   - a CRON_ROUTES key no tier schedules → never fires
 *
 * `cron run` fires a route as a faithful tick: sequential authenticated GET to
 * `BASE_URL + route` with `Authorization: Bearer <CRON_SECRET>`, mirroring
 * each app's `cloudflare/scheduled.ts`. Local CRON_SECRET defaults to empty,
 * so `cron run` sends `Bearer ` and matches — same as the handler does today.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseEnv } from "dotenv";
import { fileFor, type EnvTarget } from "@devdogsuga/env";
import { PROJECT_ROOT } from "../environment.js";
import { discoverCronMaps, type AppCronMap } from "./discovery.js";

// ── JSONC helpers ─────────────────────────────────────────────────────────────

/** Strip `// …` single-line comments so wrangler.jsonc parses as JSON. */
function stripComments(src: string): string {
  return src
    .split("\n")
    .map((line) => line.replace(/\s*\/\/.*$/, ""))
    .join("\n");
}

interface WranglerConfig {
  env?: Record<
    string,
    { triggers?: { crons?: string[] } } | undefined
  >;
  triggers?: { crons?: string[] };
}

function readWrangler(app: string): WranglerConfig {
  const path = join(PROJECT_ROOT, "apps", app, "wrangler.jsonc");
  const src = readFileSync(path, "utf8");
  return JSON.parse(stripComments(src)) as WranglerConfig;
}

/** Extract the cron expressions for a given wrangler env block. */
function cronsForTier(config: WranglerConfig, tier: string): string[] {
  if (tier === "development") return config.triggers?.crons ?? [];
  return config.env?.[tier]?.triggers?.crons ?? [];
}

// ── Human-readable schedule translator ───────────────────────────────────────

function describeExpr(expr: string): string {
  let m: RegExpExecArray | null;
  if (/^0 0 \* \* \*$/.test(expr)) return "daily at midnight UTC";
  if ((m = /^\*\/(\d+) \* \* \* \*$/.exec(expr))) return `every ${m[1]} minutes (UTC)`;
  if ((m = /^(\d+) (\d+) \* \* \*$/.exec(expr))) {
    const hh = m[2]!.padStart(2, "0");
    const mm = m[1]!.padStart(2, "0");
    return `daily at ${hh}:${mm} UTC`;
  }
  return expr;
}

// ── cron list ─────────────────────────────────────────────────────────────────

const TIERS = ["development", "staging", "production"] as const;
type Tier = (typeof TIERS)[number];

interface CronListOptions {
  app?: string;
  tier?: string;
  json?: boolean;
}

export async function runCronList(
  argv: readonly string[],
): Promise<number> {
  const opts = parseCronListOptions(argv);
  const maps = await discoverCronMaps();

  const appMaps = opts.app
    ? maps.filter((m) => m.app === opts.app)
    : maps;

  if (opts.app && appMaps.length === 0) {
    process.stderr.write(`devtools cron list: no cron map found for app "${opts.app}".\n`);
    return 1;
  }

  const tiers: Tier[] = opts.tier
    ? [opts.tier as Tier]
    : [...TIERS];

  const rows: CronListRow[] = [];

  for (const map of appMaps) {
    const config = readWrangler(map.app);
    const cronExprs = new Set(Object.keys(map.routes));

    for (const tier of tiers) {
      const scheduled = new Set(cronsForTier(config, tier));

      // Expressions in CRON_ROUTES
      for (const expr of cronExprs) {
        const entry = map.routes[expr]!;
        const status = scheduled.has(expr) ? "ok" : "never-fires";
        rows.push({
          app: map.app,
          tier,
          expr,
          human: describeExpr(expr),
          label: entry.label,
          routes: entry.routes,
          status,
        });
      }

      // Scheduled expressions not in CRON_ROUTES
      for (const expr of scheduled) {
        if (!cronExprs.has(expr)) {
          rows.push({
            app: map.app,
            tier,
            expr,
            human: describeExpr(expr),
            label: "(no CRON_ROUTES entry)",
            routes: [],
            status: "fires-nothing",
          });
        }
      }
    }
  }

  if (opts.json) {
    console.log(JSON.stringify(rows, null, 2));
    return 0;
  }

  renderCronList(rows);
  return 0;
}

interface CronListRow {
  app: string;
  tier: string;
  expr: string;
  human: string;
  label: string;
  routes: string[];
  status: "ok" | "never-fires" | "fires-nothing";
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
          ? "  ⚠  fires nothing (no CRON_ROUTES entry)"
          : "";

    console.log(`  ${row.expr.padEnd(18)}  ${row.human}`);
    console.log(`    ${row.label}${warn}`);
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
  tier: string;
  cron?: string;
  yes?: boolean;
}

export async function runCronRun(
  argv: readonly string[],
): Promise<number> {
  const opts = parseCronRunOptions(argv);
  const route = argv.find((a) => !a.startsWith("-") && a !== "run");

  const DEPLOYED_TIERS = new Set(["staging", "production"]);
  if (DEPLOYED_TIERS.has(opts.tier) && !opts.yes) {
    process.stderr.write(
      `devtools cron run: --yes is required to fire routes on a deployed tier (${opts.tier}).\n` +
        "Several jobs mutate production data — judging-start, tally-elections.\n",
    );
    return 1;
  }

  if (!route && !opts.cron) {
    process.stderr.write(
      "devtools cron run: provide a route (/cron/...) or --cron <expr>.\n",
    );
    return 1;
  }

  const maps = await discoverCronMaps();
  const appMaps = opts.app ? maps.filter((m) => m.app === opts.app) : maps;

  const tierEnv = loadTierEnv(opts.tier);
  const baseUrl = tierEnv["BASE_URL"] ?? "http://localhost:3000";
  const cronSecret = tierEnv["CRON_SECRET"] ?? "";

  const routes = opts.cron
    ? collectRoutesByExpr(appMaps, opts.cron)
    : [route!];

  if (routes.length === 0) {
    process.stderr.write(`devtools cron run: no routes found for --cron "${opts.cron}".\n`);
    return 1;
  }

  let failed = false;
  for (const r of routes) {
    const url = `${baseUrl}${r}`;
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

function collectRoutesByExpr(maps: AppCronMap[], expr: string): string[] {
  const routes: string[] = [];
  for (const map of maps) {
    const entry = map.routes[expr];
    if (entry) routes.push(...entry.routes);
  }
  return routes;
}

// ── tier env loader ───────────────────────────────────────────────────────────

// exported for unit testing; reads the tier's .env.<tier> file from PROJECT_ROOT
export function loadTierEnv(tier: string): Record<string, string> {
  const validTiers: readonly string[] = ["development", "preflight", "staging", "production"];
  const safeTarget: EnvTarget = validTiers.includes(tier) ? (tier as EnvTarget) : "development";
  const filename = fileFor(safeTarget);
  const envPath = join(PROJECT_ROOT, filename);
  if (!existsSync(envPath)) return {};
  return parseEnv(readFileSync(envPath, "utf8"));
}

function parseCronRunOptions(argv: readonly string[]): CronRunOptions {
  const opts: CronRunOptions = { tier: "development" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--app") opts.app = argv[i + 1];
    else if (argv[i] === "--tier") opts.tier = argv[i + 1] ?? "development";
    else if (argv[i] === "--cron") opts.cron = argv[i + 1];
    else if (argv[i] === "--yes") opts.yes = true;
  }
  return opts;
}
