/**
 * Database commands, over three targets.
 *
 * Moved here from `packages/supabase/scripts/sb.ts` unchanged in behaviour: the
 * `--local` and `--remote` paths still delegate to the package scripts in
 * `@devdogsuga/supabase` **by name** rather than reimplementing them, so those
 * scripts remain the single definition of what "reset" means. `pnpm sb` is
 * still wired to this, so existing muscle memory and every doc that mentions it
 * keep working.
 */
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describeEnvironment, probeEnvironment } from "./environment.js";

export type Target =
  { kind: "local" } | { kind: "remote" } | { kind: "team"; slug: string };

export const STACK_COMMANDS = [
  "link",
  "stop",
  "restart",
  "push",
  "reset",
  "status",
] as const;
export type StackCommand = (typeof STACK_COMMANDS)[number];

/**
 * Everything except the lifecycle pair.
 *
 * `stop` and `restart` act on the Docker stack on this machine, so they have
 * no `--remote` or `--team` meaning — there is no container to stop on a
 * hosted project. Derived with `Exclude` rather than written out a second
 * time, so `teamCommand` below cannot silently fall out of step with
 * `STACK_COMMANDS`: adding a command to that tuple and forgetting it here is a
 * type error at the `switch`, which is where it should be.
 */
export type TeamCommand = Exclude<StackCommand, "stop" | "restart">;

const DELEGATED: Partial<
  Record<StackCommand, Record<"local" | "remote", string>>
> = {
  push: { local: "push-migrations", remote: "push-migrations" },
  reset: { local: "reset-local-database", remote: "reset-remote-database" },
  link: { local: "start-local-stack", remote: "link-remote-project" },
};

function runScript(script: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(
      "pnpm",
      ["--filter", "@devdogsuga/supabase", "run", script],
      {
        stdio: "inherit",
      },
    );
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

// ── The --team target ────────────────────────────────────────────────────────

interface LinkResponse {
  apiUrl: string;
  publishableToken: string;
  secretToken: string;
  environmentName: string;
}

function platformUrl(path: string): string {
  const base = process.env.PLATFORM_URL ?? "http://localhost:3000";
  return `${base}${path}`;
}

/**
 * The member's own DevDogs session, pasted.
 *
 * A device-code flow is the eventual answer; a pasted token is what ships
 * first, because the alternative to "paste this once" is not "something nicer",
 * it is "the CLI does not work yet".
 */
function memberToken(): string {
  const token = process.env.DEVDOGS_TOKEN;
  if (!token) {
    throw new Error(
      "Set DEVDOGS_TOKEN to your DevDogs session token.\n" +
        "Get one from the platform console under Sandbox → CLI access.",
    );
  }
  return token;
}

async function platformCall<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(platformUrl(path), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${memberToken()}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Platform refused (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as T;
}

/**
 * Write both tokens under the names a real Supabase project uses.
 *
 * This is where the scoped-token design earns its keep at the ergonomics level.
 * The member sees `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY` and
 * picks between them exactly as they will in production — rather than the proxy
 * quietly deciding for them, which is what the deleted JWT-minting path did.
 */
async function writeEnv(response: LinkResponse): Promise<string[]> {
  const path = join(process.cwd(), ".env.local");

  let existing = "";
  try {
    existing = await readFile(path, "utf8");
  } catch {
    // First link; nothing to preserve.
  }

  const managed = new Set([
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SECRET_KEY",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  ]);
  const preserved = existing
    .split("\n")
    .filter((line) => {
      const key = line.split("=")[0]?.trim();
      return key && !managed.has(key);
    })
    .join("\n")
    .trim();

  const block = [
    `SUPABASE_URL=${response.apiUrl}`,
    `SUPABASE_PUBLISHABLE_KEY=${response.publishableToken}`,
    `SUPABASE_SECRET_KEY=${response.secretToken}`,
    `NEXT_PUBLIC_SUPABASE_URL=${response.apiUrl}`,
    `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${response.publishableToken}`,
  ].join("\n");

  await writeFile(path, `${preserved ? `${preserved}\n\n` : ""}${block}\n`);

  return [
    `Linked to ${response.environmentName}, and wrote .env.local.`,
    "",
    "SUPABASE_SECRET_KEY bypasses row-level security. Use the publishable",
    "key in anything that runs in a browser -- the proxy refuses the secret",
    "one from a browser anyway, exactly as Supabase does.",
  ];
}

async function teamCommand(
  command: TeamCommand,
  slug: string,
): Promise<{ code: number; lines: string[] }> {
  switch (command) {
    case "link": {
      const lines = await writeEnv(
        await platformCall<LinkResponse>("/sandbox/link", { slug }),
      );
      return { code: 0, lines };
    }
    case "push": {
      const result = await platformCall<{ applied: number }>("/sandbox/push", {
        slug,
      });
      return {
        code: 0,
        lines: [`Applied migrations to ${slug} (${result.applied} files).`],
      };
    }
    case "reset": {
      const result = await platformCall<{ ok: boolean }>("/sandbox/reset", {
        slug,
      });
      return {
        code: result.ok ? 0 : 1,
        lines: [result.ok ? `Reset ${slug}.` : "Reset refused."],
      };
    }
    case "status": {
      const result = await platformCall<{
        status: string;
        waking: boolean;
        etaSeconds?: number;
      }>("/sandbox/status", { slug });
      const lines = [`${slug}: ${result.status}`];
      if (result.waking) {
        // ~196s measured. Saying "about four minutes" beats a spinner that
        // looks identical at second 5 and second 190.
        lines.push(
          `Waking up -- about ${Math.ceil((result.etaSeconds ?? 240) / 60)} minutes.`,
        );
      }
      return { code: 0, lines };
    }
  }
}

// ── The local stack's lifecycle ──────────────────────────────────────────────

/**
 * Stop, then start again.
 *
 * Two delegated scripts rather than one, because `supabase restart` does not
 * exist — the CLI's own answer to a changed `config.toml` is a stop/start
 * pair. Doing it here turns that into one menu entry, rather than two
 * commands the contributor has to know to run in that order.
 *
 * A failed stop short-circuits. Starting a stack that never went down would
 * report success and leave the config change unapplied, which is the one
 * outcome worse than a visible failure.
 */
async function restartLocal(): Promise<{ code: number; lines: string[] }> {
  const code = await runScript("stop-local-stack");
  if (code !== 0) {
    // Names its own scrollback, because a failure that arrives with lines is
    // taken by `cli.ts` to have explained itself — see the contract there.
    return {
      code,
      lines: [
        "Stopping failed, so nothing was restarted. " +
          "Scroll up for the output from the Supabase CLI.",
      ],
    };
  }
  return { code: await runScript("start-local-stack"), lines: [] };
}

/**
 * What `status --local` says now that it can answer for itself.
 *
 * It used to print "Run `supabase status` for the local stack" — a status
 * command whose entire output was the name of a different status command.
 * `environment.ts` already reads the two facts that question is really
 * asking about, so this reports them and names the next step.
 *
 * It stops short of printing the stack's URLs and keys. `supabase status`
 * does that, it is one line away, and a status check is not a reason to spray
 * credentials into a terminal's scrollback.
 */
function localStatus(): { code: number; lines: string[] } {
  const env = probeEnvironment();

  let next: string;
  if (env.docker === "no") {
    next = "Start Docker, then `pnpm devtools link` to bring the stack up.";
  } else if (env.stack === "yes") {
    next = "The stack is up. `supabase status` prints its URLs and keys.";
  } else if (env.stack === "no") {
    next = "Nothing is running. `pnpm devtools link` starts it.";
  } else {
    next = "Could not read Docker. `supabase status` asks the stack directly.";
  }

  // Two entries, not three with a blank between them: the caller prints each
  // through `log.message`, which already spaces them.
  return { code: 0, lines: [describeEnvironment(env), next] };
}

/** Runs a stack command, returning its exit code and anything to report. */
export async function runStackCommand(
  command: StackCommand,
  target: Target,
): Promise<{ code: number; lines: string[] }> {
  // The lifecycle pair is handled first, and every branch returns — which is
  // also what narrows `command` to `TeamCommand` for the dispatch below.
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
    // Delegated by name like the rest; it is simply not in `DELEGATED`,
    // which maps a command across both targets and this one has only the one.
    return { code: await runScript("stop-local-stack"), lines: [] };
  }

  if (target.kind === "team") return teamCommand(command, target.slug);

  if (command === "status") {
    if (target.kind === "local") return localStatus();
    return {
      code: 0,
      lines: ["Check the Supabase dashboard for the linked project."],
    };
  }

  const script = DELEGATED[command]?.[target.kind];
  if (!script) {
    return { code: 1, lines: [`No ${command} for --${target.kind}.`] };
  }
  return { code: await runScript(script), lines: [] };
}
