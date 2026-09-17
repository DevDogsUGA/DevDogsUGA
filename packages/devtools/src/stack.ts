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
  return seedBuckets(false);
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

async function pushMigrations(linked: boolean): Promise<number> {
  const code = await supabase("db", "push", ...(linked ? ["--linked"] : []));
  if (code !== 0) return code;
  return generateTypes(linked);
}

async function resetLocal(): Promise<number> {
  const code = await supabase("db", "reset");
  if (code !== 0) return code;
  const types = await generateTypes(false);
  if (types !== 0) return types;
  return seedBuckets(false);
}

async function resetRemote(): Promise<number> {
  const code = await supabase("db", "reset", "--linked");
  if (code !== 0) return code;
  const types = await generateTypes(true);
  if (types !== 0) return types;
  return seedBuckets(true);
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

/** Runs a stack command, returning its exit code and anything to report. */
export async function runStackCommand(
  command: StackCommand,
  target: Target,
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
      lines: ["Check the Supabase dashboard for the linked project."],
    };
  }

  if (command === "start") {
    // Machine-local: the Docker stack on this machine, so the target is
    // ignored rather than switched on. `db connect` is the remote-project
    // half of the old `link`, and it takes a ref, not a `Target`.
    return { code: await startLocalStack(), lines: [] };
  }

  if (command === "migrate") {
    return { code: await pushMigrations(target.kind === "remote"), lines: [] };
  }

  if (command === "reset") {
    const code = await (target.kind === "remote"
      ? resetRemote()
      : resetLocal());
    return { code, lines: [] };
  }

  return { code: 1, lines: [`No handler for ${command}.`] };
}
