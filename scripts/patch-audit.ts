/**
 * `check:patches`: audit the repo's pnpm patches against their upstream fixes.
 *
 *   tsx scripts/patch-audit.ts [--json]
 *
 * `patches/patches.json` records, for every `patchedDependencies` entry in
 * pnpm-workspace.yaml, why it exists, the upstream PRs/issues that make it
 * unnecessary, and which npm package's release carries the fix.
 *
 *   1. Consistency (exit 1 on failure): the manifest and `patchedDependencies`
 *      list the same keys, every patch file exists and matches the path pnpm
 *      is given, and every entry says why / upstream / releasedIn.
 *   2. Upstream status: each URL is looked up on the GitHub REST API (a PR is
 *      resolved when merged, an issue when closed). `anyOf` decides whether one
 *      resolved URL or all of them are needed.
 *   3. Release check: once resolved, npm is asked whether `releasedIn` has a
 *      version published after the resolution date that is newer than the one
 *      this repo has installed (read from pnpm-lock.yaml). If so the patch is
 *      removable.
 *
 * Only consistency fails the process. Network trouble and removable patches
 * are warnings (`::warning::` annotations under GitHub Actions). `--json`
 * prints the full report for a scheduled job to consume.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export interface ManifestEntry {
  file: string;
  why: string;
  upstream: string[];
  anyOf?: boolean;
  releasedIn: string;
  notes?: string;
}

export type Manifest = Record<string, ManifestEntry>;

export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

// --- Consistency -------------------------------------------------------------

/** Read `patchedDependencies` out of pnpm-workspace.yaml (key -> patch path). */
export function parsePatchedDependencies(yaml: string): Record<string, string> {
  const result: Record<string, string> = {};
  let inBlock = false;
  for (const line of yaml.split(/\r?\n/)) {
    if (!inBlock) {
      inBlock = /^patchedDependencies:\s*$/.test(line);
      continue;
    }
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    if (!/^\s/.test(line)) break; // next top-level key
    const match =
      /^\s+(?:'([^']+)'|"([^"]+)"|([^\s:'"]+(?:@[^\s:]+)?)):\s*(.+?)\s*$/.exec(
        line,
      );
    if (!match) continue;
    const key = match[1] ?? match[2] ?? match[3];
    const value = match[4]?.replace(/^['"]|['"]$/g, "");
    if (key && value) result[key] = value;
  }
  return result;
}

export function checkConsistency(input: {
  patched: Record<string, string>;
  manifest: Record<string, Partial<ManifestEntry>>;
  patchFiles: ReadonlySet<string>;
}): string[] {
  const errors: string[] = [];
  const { patched, manifest, patchFiles } = input;

  for (const key of Object.keys(patched)) {
    if (!(key in manifest))
      errors.push(
        `${key}: in patchedDependencies but missing from patches/patches.json`,
      );
  }
  for (const key of Object.keys(manifest)) {
    if (!(key in patched))
      errors.push(
        `${key}: in patches/patches.json but not in patchedDependencies`,
      );
  }

  for (const [key, entry] of Object.entries(manifest)) {
    const blank = (value: unknown) =>
      typeof value !== "string" || value.trim() === "";
    if (blank(entry.why)) errors.push(`${key}: "why" is empty`);
    if (blank(entry.releasedIn)) errors.push(`${key}: "releasedIn" is empty`);
    if (!Array.isArray(entry.upstream) || entry.upstream.length === 0) {
      errors.push(`${key}: "upstream" must list at least one URL`);
    } else {
      for (const url of entry.upstream) {
        if (parseUpstreamUrl(url) === null)
          errors.push(
            `${key}: upstream "${url}" is not a GitHub PR or issue URL`,
          );
      }
    }
    if (blank(entry.file)) {
      errors.push(`${key}: "file" is empty`);
      continue;
    }
    const file = entry.file as string;
    if (!patchFiles.has(file))
      errors.push(`${key}: patches/${file} does not exist`);
    const declared = patched[key];
    if (declared !== undefined && declared !== `patches/${file}`) {
      errors.push(
        `${key}: file "${file}" does not match patchedDependencies path "${declared}"`,
      );
    }
  }
  return errors;
}

// --- Upstream status ---------------------------------------------------------

export interface UpstreamRef {
  owner: string;
  repo: string;
  number: number;
  kind: "pr" | "issue";
}

export function parseUpstreamUrl(url: string): UpstreamRef | null {
  const match =
    /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/(pull|issues)\/(\d+)\/?$/.exec(
      url,
    );
  if (!match) return null;
  return {
    owner: match[1] as string,
    repo: match[2] as string,
    number: Number(match[4]),
    kind: match[3] === "pull" ? "pr" : "issue",
  };
}

export interface UpstreamStatus {
  url: string;
  resolved: boolean;
  /** merged_at (PR) or closed_at (issue) when resolved. */
  date: string | null;
  /** Human-readable state, e.g. "merged", "open", "closed without merge". */
  state: string;
  /** Set when the lookup failed; `resolved` is then false. */
  error?: string;
}

export async function fetchUpstreamStatus(
  url: string,
  fetchImpl: FetchLike,
  token?: string,
): Promise<UpstreamStatus> {
  const ref = parseUpstreamUrl(url);
  if (!ref)
    return {
      url,
      resolved: false,
      date: null,
      state: "unknown",
      error: "not a GitHub PR or issue URL",
    };
  const api = `https://api.github.com/repos/${ref.owner}/${ref.repo}/${ref.kind === "pr" ? "pulls" : "issues"}/${ref.number}`;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "devdogsuga-patch-audit",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const res = await fetchImpl(api, { headers });
    if (!res.ok)
      return {
        url,
        resolved: false,
        date: null,
        state: "unknown",
        error: `GitHub API ${res.status}`,
      };
    const body = (await res.json()) as {
      state?: string;
      merged?: boolean;
      merged_at?: string | null;
      closed_at?: string | null;
    };
    if (ref.kind === "pr") {
      if (body.merged_at)
        return { url, resolved: true, date: body.merged_at, state: "merged" };
      return {
        url,
        resolved: false,
        date: null,
        state: body.state === "closed" ? "closed without merge" : "open",
      };
    }
    if (body.state === "closed")
      return {
        url,
        resolved: true,
        date: body.closed_at ?? null,
        state: "closed",
      };
    return { url, resolved: false, date: null, state: "open" };
  } catch (error) {
    return {
      url,
      resolved: false,
      date: null,
      state: "unknown",
      error: errorMessage(error),
    };
  }
}

/** All (or any, with `anyOf`) upstream URLs resolved; date is the deciding one. */
export function resolveUpstream(
  statuses: UpstreamStatus[],
  anyOf: boolean,
): { resolved: boolean; resolvedAt: string | null } {
  const done = statuses.filter((s) => s.resolved);
  if (anyOf) {
    if (done.length === 0) return { resolved: false, resolvedAt: null };
    // The earliest resolution is the first moment the patch could go.
    return { resolved: true, resolvedAt: earliest(done.map((s) => s.date)) };
  }
  if (statuses.length === 0 || done.length !== statuses.length)
    return { resolved: false, resolvedAt: null };
  // Every URL has to be resolved, so the last one to resolve gates removal.
  return { resolved: true, resolvedAt: latest(done.map((s) => s.date)) };
}

function earliest(dates: (string | null)[]): string | null {
  const valid = dates
    .filter((d): d is string => d !== null)
    .sort((a, b) => Date.parse(a) - Date.parse(b));
  return valid[0] ?? null;
}

function latest(dates: (string | null)[]): string | null {
  const valid = dates
    .filter((d): d is string => d !== null)
    .sort((a, b) => Date.parse(a) - Date.parse(b));
  return valid[valid.length - 1] ?? null;
}

// --- Release check -----------------------------------------------------------

type Triple = [number, number, number];

function parseVersion(version: string): Triple | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version); // stable releases only
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

export function compareVersions(a: string, b: string): number {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return 0;
  for (let i = 0; i < 3; i++) {
    const diff = (x[i] as number) - (y[i] as number);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * The version to bump to: the earliest stable release published after the
 * upstream resolution that is also greater than the installed version.
 */
export function findFixRelease(
  times: Record<string, string>,
  installed: string,
  resolvedAt: string,
): string | null {
  const since = Date.parse(resolvedAt);
  const candidates = Object.entries(times)
    .filter(
      ([version, published]) =>
        parseVersion(version) !== null && Date.parse(published) > since,
    )
    .map(([version]) => version)
    .filter((version) => compareVersions(version, installed) > 0)
    .sort(compareVersions);
  return candidates[0] ?? null;
}

export async function fetchPublishTimes(
  pkg: string,
  fetchImpl: FetchLike,
): Promise<Record<string, string>> {
  const res = await fetchImpl(
    `https://registry.npmjs.org/${pkg.replace("/", "%2F")}`,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": "devdogsuga-patch-audit",
      },
    },
  );
  if (!res.ok) throw new Error(`npm registry ${res.status} for ${pkg}`);
  const body = (await res.json()) as { time?: Record<string, string> };
  const times = { ...(body.time ?? {}) };
  delete times.created;
  delete times.modified;
  return times;
}

/** Highest version of `pkg` that pnpm-lock.yaml resolves, or null. */
export function installedVersion(lockfile: string, pkg: string): string | null {
  let best: string | null = null;
  const escaped = pkg.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  const re = new RegExp(`^ {2}'?${escaped}@(\\d+\\.\\d+\\.\\d+)[('":]`, "gm");
  for (const match of lockfile.matchAll(re)) {
    const version = match[1] as string;
    if (best === null || compareVersions(version, best) > 0) best = version;
  }
  return best;
}

// --- Audit -------------------------------------------------------------------

export type PatchState =
  "pending" | "awaiting-release" | "removable" | "unknown";

export interface PatchReport {
  key: string;
  file: string;
  state: PatchState;
  anyOf: boolean;
  upstream: UpstreamStatus[];
  resolvedAt: string | null;
  releasedIn: string;
  installed: string | null;
  fixVersion: string | null;
  /** What to do, for removable patches. */
  action: string | null;
  warnings: string[];
}

export async function auditPatch(
  key: string,
  entry: ManifestEntry,
  deps: { fetch: FetchLike; lockfile: string; token?: string },
): Promise<PatchReport> {
  const anyOf = entry.anyOf ?? false;
  const warnings: string[] = [];
  const upstream = await Promise.all(
    entry.upstream.map((url) =>
      fetchUpstreamStatus(url, deps.fetch, deps.token),
    ),
  );
  for (const status of upstream) {
    if (status.error) warnings.push(`${status.url}: ${status.error}`);
  }
  const base = {
    key,
    file: entry.file,
    anyOf,
    upstream,
    releasedIn: entry.releasedIn,
    installed: installedVersion(deps.lockfile, entry.releasedIn),
    fixVersion: null,
    action: null,
  };

  const { resolved, resolvedAt } = resolveUpstream(upstream, anyOf);
  if (!resolved || resolvedAt === null) {
    const lookupFailed = upstream.some((s) => s.error);
    // A failed lookup only leaves the answer unknown when it could have changed it.
    const undecided =
      lookupFailed && (!anyOf || upstream.every((s) => !s.resolved));
    return {
      ...base,
      state: undecided ? "unknown" : "pending",
      resolvedAt: null,
      warnings,
    };
  }
  if (base.installed === null) {
    warnings.push(
      `${entry.releasedIn} is not in pnpm-lock.yaml; cannot compare versions`,
    );
    return { ...base, state: "unknown", resolvedAt, warnings };
  }

  let times: Record<string, string>;
  try {
    times = await fetchPublishTimes(entry.releasedIn, deps.fetch);
  } catch (error) {
    warnings.push(
      `npm lookup for ${entry.releasedIn} failed: ${errorMessage(error)}`,
    );
    return { ...base, state: "unknown", resolvedAt, warnings };
  }
  const fixVersion = findFixRelease(times, base.installed, resolvedAt);
  if (fixVersion === null)
    return { ...base, state: "awaiting-release", resolvedAt, warnings };
  return {
    ...base,
    state: "removable",
    resolvedAt,
    fixVersion,
    action: `bump ${entry.releasedIn} to ${fixVersion}, delete patches/${entry.file}, remove its patchedDependencies line and the "${key}" entry in patches/patches.json`,
    warnings,
  };
}

// --- Output ------------------------------------------------------------------

export function formatTable(reports: PatchReport[]): string {
  const rows = [
    ["PATCH", "STATE", "UPSTREAM", "RELEASED IN", "INSTALLED", "FIX"],
    ...reports.map((r) => [
      r.key,
      r.state,
      `${r.upstream.filter((u) => u.resolved).length}/${r.upstream.length} resolved (${r.anyOf ? "any" : "all"})`,
      r.releasedIn,
      r.installed ?? "?",
      r.fixVersion ?? "-",
    ]),
  ];
  const widths = (rows[0] as string[]).map((_, i) =>
    Math.max(...rows.map((row) => (row[i] as string).length)),
  );
  const lines = rows.map((row) =>
    row
      .map((cell, i) => cell.padEnd(widths[i] as number))
      .join("  ")
      .trimEnd(),
  );
  lines.splice(1, 0, widths.map((w) => "-".repeat(w)).join("  "));
  return lines.join("\n");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// --- Main --------------------------------------------------------------------

async function main(): Promise<number> {
  const json = process.argv.includes("--json");
  const inActions = process.env.GITHUB_ACTIONS === "true";
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  // Human output goes to stderr under --json so stdout stays parseable.
  const log = json ? console.error : console.log;

  const patched = parsePatchedDependencies(
    readFileSync(join(root, "pnpm-workspace.yaml"), "utf8"),
  );
  const manifest = JSON.parse(
    readFileSync(join(root, "patches/patches.json"), "utf8"),
  ) as Manifest;
  const patchFiles = new Set(
    readdirSync(join(root, "patches")).filter((f) =>
      existsSync(join(root, "patches", f)),
    ),
  );

  const errors = checkConsistency({ patched, manifest, patchFiles });
  if (errors.length > 0) {
    for (const error of errors) {
      console.error(
        inActions
          ? `::error file=patches/patches.json::${error}`
          : `error: ${error}`,
      );
    }
    console.error(`patches: ${errors.length} consistency problem(s).`);
    return 1;
  }
  log(
    `patches: manifest agrees with patchedDependencies (${Object.keys(manifest).length} patches).`,
  );

  const lockfile = readFileSync(join(root, "pnpm-lock.yaml"), "utf8");
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || undefined;
  const reports = await Promise.all(
    Object.entries(manifest).map(([key, entry]) =>
      auditPatch(key, entry, {
        fetch: fetch as unknown as FetchLike,
        lockfile,
        token,
      }),
    ),
  );

  if (json) {
    console.log(JSON.stringify({ patches: reports }, null, 2));
  } else {
    console.log(`\n${formatTable(reports)}\n`);
  }
  for (const report of reports) {
    for (const warning of report.warnings) {
      log(
        inActions
          ? `::warning title=Patch audit (${report.key})::${warning}`
          : `warning: ${report.key}: ${warning}`,
      );
    }
    if (report.state === "removable" && report.action) {
      const message = `${report.key} can be removed: upstream resolved ${report.resolvedAt}, ${report.releasedIn}@${report.fixVersion} is out. To do: ${report.action}.`;
      log(
        inActions
          ? `::warning title=Patch removable (${report.key})::${message}`
          : `removable: ${message}`,
      );
    }
  }
  return 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().then(
    (code) => process.exit(code),
    (error: unknown) => {
      console.error(error);
      process.exit(1);
    },
  );
}
