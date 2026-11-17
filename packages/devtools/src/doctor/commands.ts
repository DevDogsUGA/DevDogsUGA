/**
 * `pnpm devtools doctor [--app <slug>] [--report]`
 *
 * The new environment checker. Entirely read-only: it inspects this machine
 * and this checkout's `.env`, and for a hosted Supabase project, makes a
 * couple of network calls to say whether it is reachable — never writes
 * anything. `setup.ts`'s hosted wizard runs the same checks at the end of
 * its own run (see its last step), so a contributor who set up through the
 * wizard and one who ran `doctor` cold see the same report.
 *
 * Every check carries a stable FAQ id from the docs contract's list (see
 * `docs/_shared/getting-started/troubleshooting.md` once written) so a
 * failure message can point at
 * `https://devdogsuga.org/docs/<app>/getting-started/troubleshooting#<id>`
 * rather than explaining itself twice.
 *
 * Pure classification lives in small exported functions so this file's own
 * tests do not have to fake `child_process`/`fs` to prove the logic; the
 * orchestrator (`runEnvironmentDoctor`) is the only part that actually
 * touches the machine.
 */
import { DONE, type CommandHandler } from "@devdogsuga/cli-core/dispatch";
import { flagValue } from "@devdogsuga/cli-core/args";
import { execSync } from "@devdogsuga/cli-core/spawn";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { log, note } from "@clack/prompts";
import { parse as parseDotenv } from "dotenv";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { CONFIG_FILE, findProductRoot } from "../product/config.js";
import {
  describeEnvironment,
  probeEnvironment,
} from "@devdogsuga/cli-core/environment";
import {
  devdogsugaRootOrNull,
  layoutAt,
} from "@devdogsuga/cli-core/repo/layout";
import { discoverRepoRoot } from "@devdogsuga/cli-core/repo/root";
import { validateSessionPoolerUrl } from "../db/pooler.js";
import {
  databaseChecks,
  probeDatabase,
  readDeclaredBuckets,
  typesFreshness,
} from "./data.js";

export type CheckStatus = "ok" | "warn" | "skip";

export interface DoctorCheck {
  id: string;
  status: CheckStatus;
  summary: string;
  /** How to fix it, when `status !== "ok"`. */
  fix?: string;
  faqId?: string;
}

const TROUBLESHOOTING_APPS = [
  "schedule-builder",
  "study-group-finder",
  "platform",
];

function faqUrl(app: string, id: string): string {
  return `https://devdogsuga.org/docs/${app}/getting-started/troubleshooting#${id}`;
}

// ── Pure checks ──────────────────────────────────────────────────────────────

/** The floor is 22.12: pnpm 11 needs `node:sqlite`, stable there. `.nvmrc`
 * pins 24, which is what a `fnm use` picks up; a machine below the floor is
 * a WARN, not an error — plenty of contributors' shells still resolve an
 * old global `node` first. */
export function checkNodeVersion(nodeVersion: string): DoctorCheck {
  const [major = 0, minor = 0] = nodeVersion.split(".").map(Number);
  const ok = major > 22 || (major === 22 && minor >= 12);
  return {
    id: "node-version",
    status: ok ? "ok" : "warn",
    summary: ok
      ? `Node ${nodeVersion}`
      : `Node ${nodeVersion} is below the floor (>= 22.12)`,
    fix: ok
      ? undefined
      : "Install fnm, then `fnm use` in the repo (reads .nvmrc).",
    faqId: ok ? undefined : "node-version",
  };
}

export function checkFnmHookPresent(shellProfile: string | null): DoctorCheck {
  const present =
    shellProfile !== null &&
    (shellProfile.includes("fnm env") || shellProfile.includes("fnm_env"));
  return {
    id: "fnm-not-found",
    status: present ? "ok" : "warn",
    summary: present
      ? "fnm hook found in shell profile"
      : "No fnm hook found in your shell profile",
    fix: present
      ? undefined
      : "Add fnm's shell hook (`fnm env --use-on-cd --shell <bash|zsh|powershell> | ...`) and restart your terminal.",
    faqId: present ? undefined : "fnm-not-found",
  };
}

export function checkPnpmVersion(
  pnpmVersion: string | null,
  pinned: string,
): DoctorCheck {
  if (!pnpmVersion) {
    return {
      id: "pnpm-missing",
      status: "warn",
      summary: "pnpm is not on PATH",
      fix: "`npm install -g pnpm` (never `corepack enable` — this repo does not use corepack).",
      faqId: "pnpm-missing",
    };
  }
  const pinnedVersion = pinned.replace(/^pnpm@/, "").split("+")[0];
  const ok = pnpmVersion === pinnedVersion;
  return {
    id: "pnpm-version",
    status: ok ? "ok" : "warn",
    summary: ok
      ? `pnpm ${pnpmVersion}`
      : `pnpm ${pnpmVersion} does not match the pinned ${pinnedVersion}`,
    fix: ok
      ? undefined
      : "pnpm self-switches to the pinned version on its first run in the repo (pmOnFail=download). Run any pnpm command here again.",
    faqId: ok ? undefined : "pnpm-version",
  };
}

/** `git config core.autocrlf` — `input` or `false` is correct on every
 * platform this repo documents (WSL2, native Windows, macOS, Linux); `true`
 * rewrites LF to CRLF on checkout and breaks anything that shells out to a
 * script with a shebang. */
export function checkAutocrlf(value: string | null): DoctorCheck {
  const ok = value === "input" || value === "false" || value === null;
  return {
    id: "crlf-line-endings",
    status: ok ? "ok" : "warn",
    summary: ok
      ? "core.autocrlf is not rewriting line endings"
      : `core.autocrlf=${value} rewrites LF to CRLF on checkout`,
    fix: ok
      ? undefined
      : "`git config --global core.autocrlf input` (or `false`), then re-clone or `git rm --cached -r . && git reset --hard`.",
    faqId: ok ? undefined : "crlf-line-endings",
  };
}

/** WSL2's own filesystem, never `/mnt/c/...` — a Windows-drive checkout
 * makes every file operation cross the 9p boundary and Docker bind mounts
 * silently fail to see edits. */
export function checkRepoUnderMntC(repoRoot: string): DoctorCheck {
  const ok = !repoRoot.startsWith("/mnt/");
  return {
    id: "repo-under-mnt-c",
    status: ok ? "ok" : "warn",
    summary: ok
      ? "Repo is on the Linux filesystem"
      : `Repo is under ${repoRoot} — a Windows drive mounted into WSL2`,
    fix: ok
      ? undefined
      : "Clone into your Linux home (~), never /mnt/c/..., and reopen with the VS Code WSL extension.",
    faqId: ok ? undefined : "repo-under-mnt-c",
  };
}

/** Windows only. `RemoteSigned` (or looser) is what lets fnm's PowerShell
 * hook and pnpm's shims actually run. */
export function checkPowerShellExecutionPolicy(
  policy: string | null,
): DoctorCheck {
  const restricted = policy === "Restricted" || policy === "AllSigned";
  return {
    id: "powershell-execution-policy",
    status: restricted ? "warn" : "ok",
    summary: restricted
      ? `Execution policy is ${policy}, which blocks locally-created scripts`
      : `Execution policy is ${policy ?? "unrestricted"}`,
    fix: restricted
      ? "`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, then restart your terminal."
      : undefined,
    faqId: restricted ? "powershell-execution-policy" : undefined,
  };
}

/**
 * The checkout's development env the way every other command loads it:
 * `.env.generated` (the local stack's connection block, written when the stack
 * starts) first and winning, then `.env`. Reading `.env` alone reported a
 * working local-Docker checkout as missing PUBLISHABLE_KEY, and took the
 * blank hosted template's `https://$PROJECT_REF.supabase.co` for a real
 * hosted project that "did not respond".
 */
export function readCheckoutEnv(
  repoRoot: string,
): Record<string, string | undefined> {
  const read = (name: string): Record<string, string> => {
    const path = join(repoRoot, name);
    return existsSync(path) ? parseDotenv(readFileSync(path, "utf8")) : {};
  };
  const generated = Object.fromEntries(
    Object.entries(read(".env.generated")).filter(([, value]) => value !== ""),
  );
  return { ...read(".env"), ...generated };
}

export function checkEnvKeysPresent(
  env: Record<string, string | undefined>,
  keys: string[],
): DoctorCheck {
  const missing = keys.filter((k) => !env[k]);
  return {
    id: "env-incomplete",
    status: missing.length === 0 ? "ok" : "warn",
    summary:
      missing.length === 0
        ? ".env has every key this run needs"
        : `.env is missing: ${missing.join(", ")}`,
    fix:
      missing.length === 0
        ? undefined
        : "`pnpm devtools setup` fills in the blanks.",
    faqId: missing.length === 0 ? undefined : "env-incomplete",
  };
}

export { validateSessionPoolerUrl };

/** Only product apps with an exact Flutter pin opt into version warnings. */
export function readFlutterPin(repoRoot: string): string | null {
  if (!existsSync(join(repoRoot, CONFIG_FILE))) return null;
  try {
    const pubspec = z
      .object({
        environment: z.object({
          flutter: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/),
        }),
      })
      .safeParse(
        parseYaml(readFileSync(join(repoRoot, "pubspec.yaml"), "utf8")),
      );
    return pubspec.success ? pubspec.data.environment.flutter : null;
  } catch {
    return null;
  }
}

/** The machine output is external input, including when Flutter fails to start. */
export function checkFlutterVersion(
  machineOutput: string | null,
  pinned: string,
): DoctorCheck {
  let installed: string | null = null;
  try {
    const version = z
      .object({ frameworkVersion: z.string().min(1) })
      .safeParse(JSON.parse(machineOutput ?? "null"));
    if (version.success) installed = version.data.frameworkVersion;
  } catch {
    // A broken installation can print a diagnostic instead of JSON.
  }
  const ok = installed === pinned;
  return {
    id: "flutter-version",
    status: ok ? "ok" : "warn",
    summary: installed
      ? ok
        ? `Flutter ${installed}`
        : `Flutter ${installed} does not match the pinned ${pinned}`
      : `Could not read the installed Flutter version (repo pins ${pinned})`,
    fix: ok ? undefined : `Install Flutter ${pinned} and put it on PATH.`,
  };
}

// ── Orchestrator ─────────────────────────────────────────────────────────────

function has(cmd: string, args: string[]): string | null {
  try {
    return execSync(cmd, args, {
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function gitConfig(key: string): string | null {
  return has("git", ["config", "--get", key]);
}

function readNvmrc(repoRoot: string): string | null {
  try {
    return readFileSync(join(repoRoot, ".nvmrc"), "utf8").trim();
  } catch {
    return null;
  }
}

function readPackageManagerPin(repoRoot: string): string | null {
  try {
    const pkg = JSON.parse(
      readFileSync(join(repoRoot, "package.json"), "utf8"),
    ) as { packageManager?: string };
    return pkg.packageManager ?? null;
  } catch {
    return null;
  }
}

function readShellProfile(): string | null {
  const home = process.env.HOME;
  if (!home) return null;
  for (const file of [
    ".bashrc",
    ".zshrc",
    ".config/fish/config.fish",
    ".bash_profile",
  ]) {
    const path = join(home, file);
    if (existsSync(path)) {
      try {
        return readFileSync(path, "utf8");
      } catch {
        // try the next one
      }
    }
  }
  return null;
}

/** Which tier and database this session points at, so a failure below can be
 * read against the right one. */
function sessionCheck(): DoctorCheck {
  const tier = process.env.DEPLOY_ENV ?? "development";
  const database = process.env.DEV_DB
    ? ` (${process.env.DEV_DB} database)`
    : "";
  return {
    id: "session-tier",
    status: "ok",
    summary: `This session targets ${tier}${database}`,
  };
}

function renderCheck(app: string, check: DoctorCheck): string {
  const icon =
    check.status === "ok" ? "OK  " : check.status === "skip" ? "SKIP" : "WARN";
  const lines = [`${icon}  ${check.summary}`];
  // A skip with an FAQ id is an optional tool (Flutter); one without is a
  // fact worth acting on (a database that could not be read).
  if (check.status === "warn" || (check.status === "skip" && !check.faqId)) {
    if (check.fix) lines.push(`      fix: ${check.fix}`);
    if (check.faqId) lines.push(`      ${faqUrl(app, check.faqId)}`);
  }
  return lines.join("\n");
}

export interface RunDoctorOptions {
  app?: string;
  report?: boolean;
}

export async function runEnvironmentDoctor(
  opts: RunDoctorOptions,
): Promise<void> {
  const app =
    opts.app && TROUBLESHOOTING_APPS.includes(opts.app) ? opts.app : "platform";
  const repoRoot = discoverRepoRoot();
  const checks: DoctorCheck[] = [];

  const nodeCheck = checkNodeVersion(process.versions.node);
  checks.push(nodeCheck);
  // Only worth raising when Node is wrong: nvm, Volta or a system Node that
  // already satisfies the floor is fine, and flagging a missing fnm hook there
  // is a false alarm.
  if (nodeCheck.status !== "ok") {
    checks.push(checkFnmHookPresent(readShellProfile()));
  } else {
    const pinnedMajor = repoRoot ? readNvmrc(repoRoot)?.split(".")[0] : null;
    const major = process.versions.node.split(".")[0];
    if (pinnedMajor && /^\d+$/.test(pinnedMajor) && pinnedMajor !== major) {
      checks.push({
        id: "node-version",
        status: "warn",
        summary: `Node ${process.versions.node} works, but the repo pins Node ${pinnedMajor} (.nvmrc)`,
        fix: "Run `fnm install && fnm use` in the repo.",
        faqId: "node-version",
      });
    }
  }

  const pnpmVersion = has("pnpm", ["--version"]);
  const pin = repoRoot ? readPackageManagerPin(repoRoot) : null;
  checks.push(
    pin
      ? checkPnpmVersion(pnpmVersion, pin)
      : {
          id: "pnpm-version",
          status: pnpmVersion ? "ok" : "warn",
          summary: pnpmVersion ? `pnpm ${pnpmVersion}` : "pnpm is not on PATH",
          fix: pnpmVersion
            ? undefined
            : "`npm install -g pnpm` (never `corepack enable`).",
          faqId: pnpmVersion ? undefined : "pnpm-missing",
        },
  );

  checks.push(checkAutocrlf(gitConfig("core.autocrlf")));

  if (repoRoot) checks.push(checkRepoUnderMntC(repoRoot));

  if (process.platform === "win32") {
    checks.push(
      checkPowerShellExecutionPolicy(
        has("powershell", ["-NoProfile", "-Command", "Get-ExecutionPolicy"]),
      ),
    );
  }

  // Local Docker stack — only relevant when the checkout has a local
  // `.env.generated`, the signature of the stack having started at least once.
  if (repoRoot && existsSync(join(repoRoot, ".env.generated"))) {
    const dockerUp = has("docker", ["info"]) !== null;
    checks.push({
      id: "docker-not-running",
      status: dockerUp ? "ok" : "warn",
      summary: dockerUp
        ? "Docker is running"
        : "Docker daemon is not answering",
      fix: dockerUp
        ? undefined
        : "Start Docker Desktop, or Docker Engine in WSL2. Never Colima.",
      faqId: dockerUp ? undefined : "docker-not-running",
    });
  }

  const productRoot = findProductRoot();
  const flutterPin = productRoot ? readFlutterPin(productRoot) : null;
  if (flutterPin) {
    checks.push(
      checkFlutterVersion(
        has("flutter", ["--version", "--machine"]),
        flutterPin,
      ),
    );
  } else if (!opts.app || opts.app === "study-group-finder") {
    const flutter = has("flutter", ["--version"]) !== null;
    checks.push({
      id: "flutter-missing",
      status: flutter ? "ok" : "skip",
      summary: flutter ? "Flutter is installed" : "Flutter is not installed",
      fix: flutter
        ? undefined
        : "Install the Flutter SDK for study-group-finder.",
      faqId: flutter ? undefined : "flutter-missing",
    });
    if (flutter) {
      const devices = has("adb", ["devices"]);
      const hasDevice = Boolean(
        devices
          ?.split("\n")
          .slice(1)
          .some((line) => line.trim().endsWith("device")),
      );
      checks.push({
        id: "adb-no-devices",
        status: hasDevice ? "ok" : "skip",
        summary: hasDevice
          ? "adb sees a device or emulator"
          : "adb sees no device or emulator",
        fix: hasDevice
          ? undefined
          : "Start an Android Studio emulator (or plug in a device). On WSL2 with a Windows emulator, run `adb kill-server` on Windows first.",
        faqId: hasDevice ? undefined : "adb-no-devices",
      });
    }
  }

  let env: Record<string, string | undefined> = {};
  if (repoRoot) {
    env = readCheckoutEnv(repoRoot);
    checks.push(checkEnvKeysPresent(env, ["API_URL", "PUBLISHABLE_KEY"]));
  }

  // ── Hosted checks — only when .env looks like a hosted project ───────────
  const isHosted = Boolean(
    env.API_URL &&
    !env.API_URL.includes("127.0.0.1") &&
    !env.API_URL.includes("localhost"),
  );
  if (isHosted && env.API_URL) {
    let reachable = false;
    let probeStatus: number | null = null;
    try {
      const res = await fetch(`${env.API_URL}/auth/v1/settings`, {
        signal: AbortSignal.timeout(5000),
      });
      probeStatus = res.status;
      reachable = res.status < 500;
    } catch {
      reachable = false;
    }
    checks.push({
      id: "supabase-unreachable",
      status: reachable ? "ok" : "warn",
      summary: reachable
        ? "The hosted project answers"
        : "The hosted project's API URL did not respond",
      fix: reachable
        ? undefined
        : "Check the API URL in .env, and that the project is not paused.",
      faqId: reachable ? undefined : "supabase-unreachable",
    });
    if (probeStatus === 503 || probeStatus === 522 || probeStatus === 540) {
      checks.push({
        id: "supabase-paused",
        status: "warn",
        summary: "The project looks paused",
        fix: "Unpause it from the Supabase dashboard (free tier pauses after ~1 week idle).",
        faqId: "supabase-paused",
      });
    }

    if (reachable && env.SECRET_KEY) {
      let keysValid = false;
      try {
        const res = await fetch(
          `${env.API_URL}/auth/v1/admin/users?page=1&per_page=1`,
          {
            headers: {
              Authorization: `Bearer ${env.SECRET_KEY}`,
              apikey: env.SECRET_KEY,
            },
            signal: AbortSignal.timeout(5000),
          },
        );
        keysValid = res.status !== 401 && res.status !== 403;
      } catch {
        keysValid = false;
      }
      checks.push({
        id: "supabase-keys-invalid",
        status: keysValid ? "ok" : "warn",
        summary: keysValid
          ? "SECRET_KEY is accepted"
          : "SECRET_KEY was rejected",
        fix: keysValid
          ? undefined
          : "Copy the service_role secret key again from Project Settings -> API.",
        faqId: keysValid ? undefined : "supabase-keys-invalid",
      });
    }
  }

  if (env.DB_URL) {
    const validation = validateSessionPoolerUrl(env.DB_URL);
    checks.push({
      id: validation.faqId ?? "db-url-direct-connection",
      status: validation.ok ? "ok" : "warn",
      summary: validation.ok
        ? "DB_URL is a Session pooler string"
        : (validation.message ?? "DB_URL is not a Session pooler string"),
      fix: validation.ok ? undefined : validation.message,
      faqId: validation.faqId,
    });
  }

  // ── The session: which tier this is, and what is in its database ───────────
  checks.push(sessionCheck());
  if (repoRoot) {
    // What `db status` used to say, now one line among the rest.
    const machine = probeEnvironment();
    checks.push({
      id: "local-stack",
      status: machine.stack === "yes" ? "ok" : "skip",
      summary: describeEnvironment(machine),
      fix:
        machine.stack === "no" && machine.docker === "yes"
          ? "Start it with `pnpm devtools supabase start`."
          : undefined,
    });
  }
  // `supabase/` and the generated types are DevDogsUGA's, so from a Backstage
  // checkout they are read through `devdogsuga/` (and skipped without it).
  const supabaseRoot = repoRoot
    ? devdogsugaRootOrNull(layoutAt(repoRoot))
    : null;
  if (supabaseRoot) checks.push(typesFreshness(supabaseRoot));
  const sessionDbUrl = process.env.DB_URL;
  if (supabaseRoot && sessionDbUrl) {
    try {
      checks.push(
        ...databaseChecks(
          await probeDatabase(sessionDbUrl),
          readDeclaredBuckets(supabaseRoot),
        ),
      );
    } catch (err) {
      // Not a fault in the checkout: the stack may simply be off, or the
      // database not migrated yet. The lines above already say which.
      checks.push({
        id: "database-unreachable",
        status: "skip",
        summary: `Could not read the session's database (${err instanceof Error ? err.message : String(err)})`,
        fix: "Start the stack with `pnpm devtools supabase start`, or apply migrations with `pnpm devtools apply-migrations`.",
      });
    }
  }

  note(
    checks.map((c) => renderCheck(app, c)).join("\n\n"),
    opts.app ? `Doctor — ${opts.app}` : "Doctor",
  );

  const warnings = checks.filter((c) => c.status === "warn").length;
  if (warnings === 0) log.success("Everything checked out.");
  else
    log.warn(`${warnings} check${warnings === 1 ? "" : "s"} need attention.`);

  if (opts.report) {
    const redacted = [
      `OS: ${process.platform} ${process.arch}`,
      `Node: ${process.versions.node}`,
      ...checks.map(
        (c) => `${c.status.toUpperCase().padEnd(4)} ${c.id}: ${c.summary}`,
      ),
    ].join("\n");
    note(redacted, "Paste this in Discord");
  }
}

export const handleDoctor: CommandHandler = async (rest) => {
  await runEnvironmentDoctor({
    app: flagValue(rest, "--app"),
    report: rest.includes("--report"),
  });
  return DONE;
};
