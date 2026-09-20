/**
 * Database commands, over local and remote targets.
 *
 * Previously delegated to `@devdogsuga/supabase` package scripts by name.
 * Now inlined so that package's scripts can be deleted and the supabase CLI
 * is invoked directly through the shared helpers in `db/run.ts`.
 */
import { rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  describeEnvironment,
  probeEnvironment,
  PROJECT_ROOT,
} from "./environment.js";
import {
  generateTypes,
  run,
  seedBuckets,
  supabase,
  supabaseCapture,
} from "./db/run.js";
import type { RemoteConnection } from "./db/remote.js";

export type Target = { kind: "local" } | { kind: "remote" };

// Scope order, matching `db`'s subcommands in `commands.ts`: the four that
// act on the Supabase stack (`connect` is handled separately below — it takes
// a positional ref, not a `Target`), then the four that act on the Postgres
// database inside it.
export const STACK_COMMANDS = [
  "start",
  "stop",
  "restart",
  "status",
  "migrate",
  "reset",
] as const;
export type StackCommand = (typeof STACK_COMMANDS)[number];

// ── Implementations ──────────────────────────────────────────────────────────

async function startLocalStack(): Promise<number> {
  const code = await supabase("start");
  if (code !== 0) return code;
  // Write the local stack's connection details so with-env can load them.
  let env: string;
  try {
    env = await supabaseCapture("status", "-o", "env");
  } catch {
    return 1;
  }
  await writeFile(join(PROJECT_ROOT, ".env.generated"), env);
  return seedBuckets({ kind: "local" });
}

async function stopLocalStack(): Promise<number> {
  const code = await supabase("stop");
  if (code !== 0) return code;
  rmSync(join(PROJECT_ROOT, ".env.generated"), { force: true });
  return 0;
}

/**
 * `db connect [<project-ref>]` — register a hosted project as the remote
 * target.
 *
 * Takes a ref directly (the wizard's positional, or a scripted caller's
 * argument) rather than a `Target`: there is no "local" or "remote" to choose
 * between here, only which hosted project `--target remote` should mean from
 * now on. Falls back to `PROJECT_REF` in the environment when no ref is
 * given, matching what the old `link --target remote` path did.
 */
export async function connectRemoteProject(ref?: string): Promise<number> {
  const projectRef = ref ?? process.env.PROJECT_REF;
  if (!projectRef) {
    process.stderr.write(
      "devtools db connect: no project ref given, and PROJECT_REF is not set. " +
        "Pass one, or add PROJECT_REF to your .env file.\n",
    );
    return 1;
  }
  return supabase("link", "--project-ref", projectRef);
}

async function pushLocalMigrations(): Promise<number> {
  const code = await supabase("db", "push");
  if (code !== 0) return code;
  return generateTypes({ kind: "local" });
}

/**
 * `--db-url`, not `--linked`: the resolved tier's OWN connection string,
 * rather than whatever project the supabase CLI happens to have linked on
 * this machine. See `db/remote.ts`'s header — the same reasoning applies to
 * every remote operation in this file.
 */
async function pushRemoteMigrations(
  connection: RemoteConnection,
): Promise<number> {
  const code = await supabase("db", "push", "--db-url", connection.dbUrl);
  if (code !== 0) return code;
  return generateTypes({ kind: "remote", dbUrl: connection.dbUrl });
}

async function resetLocal(): Promise<number> {
  const code = await supabase("db", "reset");
  if (code !== 0) return code;
  const types = await generateTypes({ kind: "local" });
  if (types !== 0) return types;
  return seedBuckets({ kind: "local" });
}

/**
 * ⚠️ SAFETY-CRITICAL: drops and re-migrates `connection.dbUrl`. The caller
 * (`cli.ts`'s `runStack`) has already resolved and confirmed the tier this
 * acts on — including the hard production gate — before this ever runs.
 */
async function resetRemote(connection: RemoteConnection): Promise<number> {
  const code = await supabase("db", "reset", "--db-url", connection.dbUrl);
  if (code !== 0) return code;
  const types = await generateTypes({
    kind: "remote",
    dbUrl: connection.dbUrl,
  });
  if (types !== 0) return types;
  return seedBuckets({ kind: "remote", projectRef: connection.projectRef });
}

// ── The local stack's lifecycle ──────────────────────────────────────────────

/**
 * Stop, then start again.
 *
 * Two steps rather than one, because `supabase restart` does not exist. The
 * CLI's own answer to a changed `config.toml` is a stop/start pair. Doing it
 * here turns that into one menu entry, rather than two commands the contributor
 * has to know to run in that order.
 *
 * A failed stop short-circuits. Starting a stack that never went down would
 * report success and leave the config change unapplied, which is the one
 * outcome worse than a visible failure.
 */
async function restartLocal(): Promise<{ code: number; lines: string[] }> {
  const code = await stopLocalStack();
  if (code !== 0) {
    return {
      code,
      lines: [
        "Stopping failed, so nothing was restarted. " +
          "Scroll up for the output from the Supabase CLI.",
      ],
    };
  }
  return { code: await startLocalStack(), lines: [] };
}

/**
 * What `status --local` says now that it can answer for itself.
 *
 * `environment.ts` already reads the two facts that question is really asking
 * about, so this reports them and names the next step.
 */
function localStatus(): { code: number; lines: string[] } {
  const env = probeEnvironment();

  let next: string;
  if (env.docker === "no") {
    next = "Start Docker, then `pnpm devtools db start` to bring the stack up.";
  } else if (env.stack === "yes") {
    next = "The stack is up. `supabase status` prints its URLs and keys.";
  } else if (env.stack === "no") {
    next = "Nothing is running. `pnpm devtools db start` starts it.";
  } else {
    next = "Could not read Docker. `supabase status` asks the stack directly.";
  }

  return { code: 0, lines: [describeEnvironment(env), next] };
}

/**
 * Runs a stack command, returning its exit code and anything to report.
 *
 * `connection` is the tier's resolved `RemoteConnection` — present exactly
 * when `target.kind === "remote"` AND the command needs one. The caller
 * (`cli.ts`'s `runStack`) resolves it, because resolving means possibly
 * prompting or entering a tier, and `stop`/`restart` reject a remote target
 * outright with no need to ask any of that first. Local behavior is
 * unchanged: every local branch below ignores `connection` entirely.
 */
export async function runStackCommand(
  command: StackCommand,
  target: Target,
  connection?: RemoteConnection,
): Promise<{ code: number; lines: string[] }> {
  if (command === "stop" || command === "restart") {
    if (target.kind !== "local") {
      return {
        code: 1,
        lines: [
          `\`${command}\` acts on the Docker stack on this machine.`,
          `A ${target.kind} project has no container here to ${command}.`,
        ],
      };
    }
    if (command === "restart") return restartLocal();
    return { code: await stopLocalStack(), lines: [] };
  }

  if (command === "status") {
    if (target.kind === "local") return localStatus();
    return {
      code: 0,
      lines: [
        connection
          ? `Check the Supabase dashboard for the ${connection.tier} project (${connection.projectRef ?? "no PROJECT_REF set"}).`
          : "Check the Supabase dashboard for the linked project.",
      ],
    };
  }

  if (command === "start") {
    // Machine-local: the Docker stack on this machine, so the target is
    // ignored rather than switched on. `db connect` is the remote-project
    // half of the old `link`, and it takes a ref, not a `Target`.
    return { code: await startLocalStack(), lines: [] };
  }

  if (command === "migrate") {
    if (target.kind === "remote") {
      if (!connection) {
        return {
          code: 1,
          lines: ["No remote connection was resolved for `migrate`."],
        };
      }
      return { code: await pushRemoteMigrations(connection), lines: [] };
    }
    return { code: await pushLocalMigrations(), lines: [] };
  }

  if (command === "reset") {
    if (target.kind === "remote") {
      if (!connection) {
        return {
          code: 1,
          lines: ["No remote connection was resolved for `reset`."],
        };
      }
      return { code: await resetRemote(connection), lines: [] };
    }
    return { code: await resetLocal(), lines: [] };
  }

  return { code: 1, lines: [`No handler for ${command}.`] };
}
