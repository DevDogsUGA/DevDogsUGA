/**
 * What this machine currently is, read once before the menu draws itself.
 *
 * The wizard used to offer the same commands to everyone: someone whose Docker
 * daemon was not running was invited to reset a database that could not
 * answer, and someone whose stack was already up had no way to stop it at all,
 * because "stop" was not in the tree. Both are the same bug. The menu
 * described the CLI rather than the situation.
 *
 * So this reads three facts and `menu.ts` adapts to them. The facts are few
 * and cheap on purpose; see `probeEnvironment` for the budget and why.
 *
 * ## Unknown is not "no"
 *
 * Every probe can come back `"unknown"`, and that is what a failed probe
 * reports rather than guessing. Nothing is hidden or flagged on `"unknown"`: a
 * machine this cannot read gets the full menu, exactly as before. A tool that
 * hides a command because a `docker ps` timed out is worse than one that never
 * adapted at all, because the command it hides is the one you were looking
 * for.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Condition } from "./commands.js";

/**
 * The repo root, which is where `supabase/config.toml` and `.env` live.
 *
 * Defined here rather than in `instance.ts`, where it used to live and which
 * still re-exports it, because that module pulls in `@supabase/supabase-js`
 * and this one runs before the menu's first frame. Resolved from this file
 * rather than `cwd` so it does not matter where the contributor invoked the
 * tool from.
 */
export const PROJECT_ROOT = join(import.meta.dirname, "..", "..", "..");

/** A fact that may be unreadable. See the header: unknown is not "no". */
export type Known = "yes" | "no" | "unknown";

export interface Environment {
  /** The Docker daemon answers. Without it there is no local stack. */
  docker: Known;
  /** The local Supabase stack's containers are up. */
  stack: Known;
  /** The root `.env` exists, so `setup` has been run at least once. */
  envFile: Known;
}

/**
 * The environment that adapts nothing.
 *
 * What the tests use, and what any caller that would rather not probe can
 * pass. Because nothing is hidden or flagged on `"unknown"`, this is exactly
 * the pre-adaptation menu, which makes it a safe fallback rather than a
 * special case to remember.
 */
export const UNKNOWN_ENVIRONMENT: Environment = {
  docker: "unknown",
  stack: "unknown",
  envFile: "unknown",
};

// ── Probes ───────────────────────────────────────────────────────────────────

/**
 * Every probe is bounded, silent, and total.
 *
 * `timeout` because a Docker daemon that is starting up (or a VM that has just
 * been resumed) accepts the connection and then never answers, and the failure
 * that produces is a menu that hangs before printing anything, with no output
 * to explain what it is waiting for.
 */
function run(file: string, args: string[]): string | null {
  try {
    return execFileSync(file, args, {
      cwd: PROJECT_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 3000,
    });
  } catch {
    return null;
  }
}

/**
 * The container name prefix the Supabase CLI gives this project's stack.
 *
 * Read with a regex rather than a TOML parser: it is one line, the shape has
 * been stable across every CLI version this repo has seen, and a parser on a
 * menu's startup path to read one string is a cost that stays invisible until
 * it is why the tool feels slow.
 *
 * Falling back to the bare `supabase_db_` prefix means a machine whose
 * `config.toml` cannot be read still detects *a* stack. That over-match is
 * deliberate: over-matching offers `stop` to someone running a different
 * Supabase project, which they can decline, while under-matching tells someone
 * their running stack is down.
 */
function containerPrefix(): string {
  try {
    const path = join(PROJECT_ROOT, "supabase", "config.toml");
    const id = /^\s*project_id\s*=\s*"([^"]+)"/m.exec(
      readFileSync(path, "utf8"),
    );
    return id?.[1] ? `supabase_db_${id[1]}` : "supabase_db_";
  } catch {
    return "supabase_db_";
  }
}

/**
 * Reads the machine.
 *
 * Two subprocesses at worst, one when Docker is down, plus an `existsSync`.
 * The budget is "cheaper than the first keystroke", because this runs before
 * the wizard's first screen and anything slower would be paid on every
 * invocation to save a few of them later.
 *
 * It does NOT call `supabase status`, which is the authoritative answer but
 * takes the better part of a second: it shells out through `pnpm exec` and
 * then talks to every service in the stack. `docker ps` answers the only
 * question the menu has (is it up?) in a fraction of that, and the commands
 * that need real credentials still go through `detectLocalInstance`, which
 * asks the authority at the moment it matters.
 */
export function probeEnvironment(): Environment {
  const envFile: Known = existsSync(join(PROJECT_ROOT, ".env")) ? "yes" : "no";

  // `docker info` rather than `docker version`: version answers from the
  // client alone, so it reports success against a daemon that is not running.
  const docker: Known = run("docker", ["info"]) === null ? "no" : "yes";

  // A stack cannot be up without a daemon to hold it, so this needs no second
  // subprocess to say "no", and asking anyway on a machine with no Docker
  // installed would pay the whole timeout for an answer already in hand.
  if (docker === "no") return { docker, stack: "no", envFile };

  const names = run("docker", ["ps", "--format", "{{.Names}}"]);
  if (names === null) return { docker, stack: "unknown", envFile };

  const prefix = containerPrefix();
  const running = names
    .split("\n")
    .some((name) => name.trim().startsWith(prefix));

  return { docker, stack: running ? "yes" : "no", envFile };
}

// ── Conditions ───────────────────────────────────────────────────────────────

/**
 * Whether a `Condition` from the command tree currently holds.
 *
 * The tree declares conditions as strings so that it stays inert data the docs
 * build can render (see `commands.ts`); this is the one place that knows what
 * they mean. `"unknown"` propagates rather than collapsing to false, and both
 * callers below read it as "do nothing".
 */
export function holds(condition: Condition, env: Environment): Known {
  switch (condition) {
    case "docker":
      return env.docker;
    case "stack-running":
      return env.stack;
    case "stack-stopped":
      // The negation of an unreadable fact is still unreadable.
      if (env.stack === "unknown") return "unknown";
      return env.stack === "no" ? "yes" : "no";
  }
}

/** What `needs` renders as when it does not hold. Kept short: it is a hint. */
const UNMET: Record<Condition, string> = {
  docker: "Docker is not running",
  "stack-running": "the local stack is not running",
  "stack-stopped": "the local stack is already running",
};

/**
 * Whether the wizard should offer this command at all.
 *
 * False only for a command whose `when` is definitively unmet: `stop`
 * against a stack that is already stopped. This is reserved for commands that
 * would be *meaningless*, never merely inconvenient: one that would fail with
 * a good error message stays in the menu and carries `needs` instead, because
 * a contributor who cannot find a command they know exists is worse off than
 * one who runs it and is told why it did not work.
 *
 * Hiding is a wizard-only decision. `--help` still lists these, the dispatcher
 * still accepts them, and the generated reference still documents them. The
 * menu is a guide to right now, and those three are the reference.
 */
export function isOffered(
  node: { when?: Condition },
  env: Environment,
): boolean {
  return node.when === undefined || holds(node.when, env) !== "no";
}

/**
 * Why this command will not work right now, or `null` if nothing is in the way.
 *
 * Appended to the entry's hint, so the menu says "needs Docker, which is not
 * running" on the line itself, rather than after the reader has chosen it and
 * waited for a connection attempt to fail.
 */
export function blockedBecause(
  node: { needs?: Condition },
  env: Environment,
): string | null {
  if (!node.needs) return null;
  return holds(node.needs, env) === "no" ? UNMET[node.needs] : null;
}

// ── Reporting ────────────────────────────────────────────────────────────────

const LABELS: Record<Known, string> = {
  yes: "yes",
  no: "no",
  unknown: "could not tell",
};

/**
 * The three facts, as the wizard's opening note and as `status --local`.
 *
 * Printed before the first question rather than discovered through failures:
 * "Docker running  no" at the top of the screen is the whole explanation for
 * why the database commands below it are flagged, and it costs one glance.
 */
export function describeEnvironment(env: Environment): string {
  return [
    `Docker running   ${LABELS[env.docker]}`,
    `Local stack up   ${LABELS[env.stack]}`,
    `.env present     ${LABELS[env.envFile]}`,
  ].join("\n");
}
