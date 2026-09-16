/**
 * `devtools cron list` and `devtools cron run`
 *
 * `cron list` reconciles each app's `wrangler.jsonc triggers.crons` (per tier)
 * against its `CRON_ROUTES` and `WORKFLOW_CRONS` exports and surfaces every
 * failure shape:
 *   - a wrangler schedule matching neither map → fires nothing
 *   - a CRON_ROUTES / WORKFLOW_CRONS key no tier schedules → never fires
 *   - a WORKFLOW_CRONS key whose binding that tier's wrangler never declares →
 *     misconfigured
 *
 * `cron run` fires a schedule as a faithful tick:
 *   - a route cron → sequential authenticated GET to `BASE_URL + route` with
 *     `Authorization: Bearer <CRON_SECRET>`, mirroring `cloudflare/scheduled.ts`.
 *     Local CRON_SECRET defaults to empty, so it sends `Bearer ` and matches,
 *     same as the handler does.
 *   - a workflow cron → drives the real `scheduled()` handler by POSTing the
 *     Workers-runtime scheduled endpoint (`/cdn-cgi/handler/scheduled`) on a
 *     local `wrangler dev`/OpenNext preview, so the whole `.create()` path runs
 *     BEFORE any deploy. Deployed tiers print the `wrangler workflows trigger`
 *     command instead of firing.
 *
 * Both paths pre-flight the target origin and, if nothing is listening, print a
 * tailored "start the server" hint rather than a raw ECONNREFUSED.
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

interface WranglerWorkflow {
  binding: string;
  name: string;
  class_name?: string;
}

interface WranglerTierBlock {
  triggers?: { crons?: string[] };
  workflows?: WranglerWorkflow[];
}

interface WranglerConfig extends WranglerTierBlock {
  env?: Record<string, WranglerTierBlock | undefined>;
}

function readWrangler(app: string): WranglerConfig {
  const path = join(PROJECT_ROOT, "apps", app, "wrangler.jsonc");
  const src = readFileSync(path, "utf8");
  return JSON.parse(stripComments(src)) as WranglerConfig;
}

/** The wrangler block for a tier: top-level for development, `env.<tier>` else. */
function blockForTier(config: WranglerConfig, tier: string): WranglerTierBlock {
  return tier === "development" ? config : (config.env?.[tier] ?? {});
}

/** Extract the cron expressions for a given wrangler env block. */
function cronsForTier(config: WranglerConfig, tier: string): string[] {
  return blockForTier(config, tier).triggers?.crons ?? [];
}

/** Extract the Workflows bindings declared for a given wrangler env block. */
function workflowsForTier(
  config: WranglerConfig,
  tier: string,
): WranglerWorkflow[] {
  return blockForTier(config, tier).workflows ?? [];
}

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
 * Reconciles one app's `CRON_ROUTES` + `WORKFLOW_CRONS` against its wrangler
 * schedules for each tier. Pure — it takes the already-read wrangler config —
 * so the reconciliation table is unit-tested without touching the filesystem.
 *
 * A workflow schedule is `ok` only when the tier both schedules the expression
 * AND declares a `workflows[]` binding by the name the map points at; a
 * schedule whose binding that tier never binds is `misconfigured`, the failure
 * that would otherwise deploy a cron firing a Workflow that isn't there.
 */
export function reconcileMap(
  map: AppCronMap,
  config: WranglerConfig,
  tiers: readonly Tier[],
): CronListRow[] {
  const rows: CronListRow[] = [];
  const routeExprs = new Set(Object.keys(map.routes));
  const workflowExprs = new Set(Object.keys(map.workflows));

  for (const tier of tiers) {
    const scheduled = new Set(cronsForTier(config, tier));
    const boundWorkflows = new Map(
      workflowsForTier(config, tier).map((w) => [w.binding, w.name]),
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
        status: scheduled.has(expr) ? "ok" : "never-fires",
      });
    }

    for (const expr of workflowExprs) {
      const entry = map.workflows[expr]!;
      const workflowName = boundWorkflows.get(entry.binding);
      const status = !scheduled.has(expr)
        ? "never-fires"
        : workflowName === undefined
          ? "misconfigured"
          : "ok";
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

    for (const expr of scheduled) {
      if (!routeExprs.has(expr) && !workflowExprs.has(expr)) {
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
  const maps = await discoverCronMaps();

  const appMaps = opts.app ? maps.filter((m) => m.app === opts.app) : maps;

  if (opts.app && appMaps.length === 0) {
    process.stderr.write(
      `devtools cron list: no cron map found for app "${opts.app}".\n`,
    );
    return 1;
  }

  const tiers: Tier[] = opts.tier ? [opts.tier as Tier] : [...TIERS];

  const rows = appMaps.flatMap((map) =>
    reconcileMap(map, readWrangler(map.app), tiers),
  );

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
  tier: string;
  cron?: string;
  yes?: boolean;
  /** Origin of the local preview worker for firing a workflow cron. */
  previewUrl?: string;
}

const DEPLOYED_TIERS = new Set(["staging", "production"]);

export async function runCronRun(
  argv: readonly string[],
): Promise<number> {
  const opts = parseCronRunOptions(argv);
  const route = argv.find((a) => !a.startsWith("-") && a !== "run");

  if (!route && !opts.cron) {
    process.stderr.write(
      "devtools cron run: provide a route (/cron/...) or --cron <expr>.\n",
    );
    return 1;
  }

  const maps = await discoverCronMaps();
  const appMaps = opts.app ? maps.filter((m) => m.app === opts.app) : maps;

  // A --cron expression can resolve to a Workflow schedule instead of routes.
  // That drives the scheduled() handler on a local preview rather than fetching
  // routes, so it is handled before the route dispatch and its deployed-tier
  // --yes gate (which guards route side effects, not a local workflow tick).
  if (opts.cron) {
    const workflowHits = collectWorkflowsByExpr(appMaps, opts.cron);
    if (workflowHits.length > 0) {
      return runWorkflowTick(workflowHits, opts);
    }
  }

  if (DEPLOYED_TIERS.has(opts.tier) && !opts.yes) {
    process.stderr.write(
      `devtools cron run: --yes is required to fire routes on a deployed tier (${opts.tier}).\n` +
        "Several jobs mutate production data — judging-start, tally-elections.\n",
    );
    return 1;
  }

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

  // Pre-flight: on a local tier, a refused connection means the dev server
  // isn't up — not that a route is broken. Say so, with the command to start
  // it, instead of failing every route with a raw ECONNREFUSED.
  if (opts.tier === "development" && !(await originReachable(baseUrl))) {
    process.stderr.write(devServerHint(opts.app, baseUrl));
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

// ── workflow cron ─────────────────────────────────────────────────────────────

interface WorkflowHit {
  app: string;
  expr: string;
  binding: string;
  label: string;
}

function collectWorkflowsByExpr(
  maps: AppCronMap[],
  expr: string,
): WorkflowHit[] {
  const hits: WorkflowHit[] = [];
  for (const map of maps) {
    const entry = map.workflows[expr];
    if (entry) {
      hits.push({
        app: map.app,
        expr,
        binding: entry.binding,
        label: entry.label,
      });
    }
  }
  return hits;
}

/**
 * `wrangler dev` serves the scheduled trigger at `/cdn-cgi/handler/scheduled`;
 * older setups (and `--test-scheduled`) expose `/__scheduled`. Tried in order.
 */
export const SCHEDULED_ENDPOINTS = [
  "/cdn-cgi/handler/scheduled",
  "/__scheduled",
] as const;

/** Build the scheduled-trigger URL for a preview origin + cron expression. */
export function scheduledTriggerUrl(
  previewUrl: string,
  endpoint: string,
  expr: string,
): string {
  return `${previewUrl.replace(/\/+$/, "")}${endpoint}?cron=${encodeURIComponent(expr)}`;
}

/**
 * POSTs the Workers-runtime scheduled endpoint so the preview's `scheduled()`
 * handler runs with this cron expression — the same entry point Cloudflare
 * hits on schedule, which then calls `SCRAPE_WORKFLOW.create()`. Returns the
 * URL that fired, or null if neither endpoint shape answered ok.
 */
async function postScheduled(
  previewUrl: string,
  expr: string,
): Promise<string | null> {
  for (const endpoint of SCHEDULED_ENDPOINTS) {
    const url = scheduledTriggerUrl(previewUrl, endpoint, expr);
    try {
      const res = await fetch(url, { method: "POST" });
      if (res.ok) return url;
      // 404 → the other endpoint shape may be the live one; anything else is a
      // real failure worth surfacing verbatim.
      if (res.status !== 404) {
        process.stderr.write(`  ${endpoint}: HTTP ${res.status}\n`);
        return null;
      }
    } catch (err) {
      process.stderr.write(
        `  ${endpoint}: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      return null;
    }
  }
  process.stderr.write(
    `  neither ${SCHEDULED_ENDPOINTS.join(" nor ")} answered — is this a wrangler dev/preview server?\n`,
  );
  return null;
}

/**
 * Fires (development) or explains how to fire (deployed) a workflow-backed cron.
 *
 * Development drives the real `scheduled()` handler on the local preview.
 * Staging/production print the `wrangler workflows trigger` command instead of
 * firing: a deployed Workflow starts through Cloudflare's API, and a production
 * registrar scrape must not be one stray flag away.
 */
async function runWorkflowTick(
  hits: WorkflowHit[],
  opts: CronRunOptions,
): Promise<number> {
  if (DEPLOYED_TIERS.has(opts.tier)) {
    let missing = false;
    for (const hit of hits) {
      const name = workflowsForTier(readWrangler(hit.app), opts.tier).find(
        (w) => w.binding === hit.binding,
      )?.name;
      process.stdout.write(
        `workflow ${hit.binding} (${hit.app}, ${opts.tier}): ${hit.label}\n`,
      );
      if (name) {
        process.stdout.write(
          "  trigger it on the deployed worker with:\n" +
            `    pnpm --filter ${hit.app} exec wrangler workflows trigger ${name} --env ${opts.tier}\n`,
        );
      } else {
        process.stderr.write(
          `  no "${hit.binding}" workflow is bound in wrangler.jsonc for ${opts.tier} — nothing to trigger.\n`,
        );
        missing = true;
      }
    }
    return missing ? 1 : 0;
  }

  const tierEnv = loadTierEnv(opts.tier);
  const previewUrl =
    opts.previewUrl ?? tierEnv["PREVIEW_URL"] ?? "http://localhost:8787";

  // A Workflow only runs in the Workers runtime, so the target is the OpenNext
  // preview (wrangler dev), not `next dev`. If nothing answers, say exactly
  // that and how to start it, rather than failing on a raw ECONNREFUSED.
  if (!(await originReachable(previewUrl))) {
    process.stderr.write(previewHint(hits[0]!.app, previewUrl));
    return 1;
  }

  let failed = false;
  for (const hit of hits) {
    process.stdout.write(`→ ${hit.binding} (${hit.app}): ${hit.label}\n`);
    const firedUrl = await postScheduled(previewUrl, hit.expr);
    if (firedUrl) {
      process.stdout.write(
        `  started via ${firedUrl}\n` +
          "  the Workflow now runs asynchronously in the preview — watch its\n" +
          "  `wrangler dev` log for per-term progress and failures.\n",
      );
    } else {
      failed = true;
    }
  }
  return failed ? 1 : 0;
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

export function previewHint(app: string, previewUrl: string): string {
  return (
    `devtools cron run: nothing is listening at ${new URL(previewUrl).origin}.\n` +
    "A Workflow only runs in the Workers runtime, so it needs the OpenNext\n" +
    "preview (wrangler dev), not `next dev`. Start it, then re-run:\n" +
    `  pnpm --filter ${app} cf:preview\n` +
    "(Override the origin with --preview-url if it isn't http://localhost:8787.)\n"
  );
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
    else if (argv[i] === "--preview-url") opts.previewUrl = argv[i + 1];
    else if (argv[i] === "--yes") opts.yes = true;
  }
  return opts;
}
