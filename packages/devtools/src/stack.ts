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

export type Target =
  { kind: "local" } | { kind: "remote" } | { kind: "team"; slug: string };

export const STACK_COMMANDS = ["link", "push", "reset", "status"] as const;
export type StackCommand = (typeof STACK_COMMANDS)[number];

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
  command: StackCommand,
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

/** Runs a stack command, returning its exit code and anything to report. */
export async function runStackCommand(
  command: StackCommand,
  target: Target,
): Promise<{ code: number; lines: string[] }> {
  if (target.kind === "team") return teamCommand(command, target.slug);

  if (command === "status") {
    return {
      code: 0,
      lines: [
        target.kind === "local"
          ? "Run `supabase status` for the local stack."
          : "Check the Supabase dashboard for the linked project.",
      ],
    };
  }

  const script = DELEGATED[command]?.[target.kind];
  if (!script) {
    return { code: 1, lines: [`No ${command} for --${target.kind}.`] };
  }
  return { code: await runScript(script), lines: [] };
}
