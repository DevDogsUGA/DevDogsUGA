#!/usr/bin/env tsx
/**
 * `pnpm sb <command> [--local | --remote | --team <slug>]`
 *
 * One dispatcher over three targets. The `--local` and `--remote` paths shell
 * out to **today's exact command strings**, unchanged, so adding the third
 * target cannot regress the two that already work — the existing package
 * scripts remain the single source of truth for what those two mean.
 *
 * `--team` is the new one: it reaches a team's sandbox environment through the
 * platform, which runs the SQL under the owner's OAuth token via the Management
 * API. No member ever holds a database credential.
 */
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

type Target =
  | { kind: "local" }
  | { kind: "remote" }
  | { kind: "team"; slug: string };

const COMMANDS = ["link", "push", "reset", "status"] as const;
type Command = (typeof COMMANDS)[number];

/**
 * The existing scripts, by (command, target).
 *
 * Referenced by NAME rather than reimplemented. `reset-local-database` also
 * regenerates types and reseeds buckets; duplicating that here would mean two
 * definitions of "reset" that drift.
 */
const DELEGATED: Partial<Record<Command, Record<"local" | "remote", string>>> =
  {
    push: { local: "push-migrations", remote: "push-migrations" },
    reset: { local: "reset-local-database", remote: "reset-remote-database" },
    link: { local: "start-local-stack", remote: "link-remote-project" },
  };

function usage(): never {
  console.error(`Usage: pnpm sb <command> [target]

Commands:
  link      Point this checkout at a stack, writing .env
  push      Apply migrations
  reset     Drop and rebuild from migrations
  status    Report the target's health

Targets:
  --local              The Docker stack (default)
  --remote             The linked Supabase project
  --team <slug>        A team's sandbox environment, through the platform
`);
  process.exit(1);
}

function parse(argv: string[]): { command: Command; target: Target } {
  const [command, ...rest] = argv;
  if (!command || !COMMANDS.includes(command as Command)) usage();

  const teamIndex = rest.indexOf("--team");
  if (teamIndex !== -1) {
    const slug = rest[teamIndex + 1];
    if (!slug || slug.startsWith("--")) {
      console.error("--team needs a slug: pnpm sb link --team lantern");
      process.exit(1);
    }
    return { command: command as Command, target: { kind: "team", slug } };
  }

  return {
    command: command as Command,
    target: rest.includes("--remote") ? { kind: "remote" } : { kind: "local" },
  };
}

function run(script: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn("pnpm", ["run", script], {
      stdio: "inherit",
      cwd: join(import.meta.dirname, ".."),
    });
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
    console.error(
      "Set DEVDOGS_TOKEN to your DevDogs session token.\n" +
        "Get one from the platform console under Sandbox → CLI access.",
    );
    process.exit(1);
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
    console.error(`Platform refused (${res.status}): ${await res.text()}`);
    process.exit(1);
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
async function writeEnv(response: LinkResponse): Promise<void> {
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

  console.log(`Linked to ${response.environmentName}.`);
  console.log(`Wrote .env.local`);
  console.log("");
  console.log(
    "SUPABASE_SECRET_KEY bypasses row-level security. Use the publishable",
  );
  console.log(
    "key in anything that runs in a browser -- the proxy refuses the secret",
  );
  console.log("one from a browser anyway, exactly as Supabase does.");
}

async function teamCommand(command: Command, slug: string): Promise<number> {
  switch (command) {
    case "link": {
      await writeEnv(
        await platformCall<LinkResponse>("/api/sandbox/link", { slug }),
      );
      return 0;
    }
    case "push": {
      const result = await platformCall<{ applied: number }>(
        "/api/sandbox/push",
        { slug },
      );
      console.log(`Applied migrations to ${slug} (${result.applied} files).`);
      return 0;
    }
    case "reset": {
      const result = await platformCall<{ ok: boolean }>("/api/sandbox/reset", {
        slug,
      });
      console.log(result.ok ? `Reset ${slug}.` : `Reset refused.`);
      return result.ok ? 0 : 1;
    }
    case "status": {
      const result = await platformCall<{
        status: string;
        waking: boolean;
        etaSeconds?: number;
      }>("/api/sandbox/status", { slug });
      console.log(`${slug}: ${result.status}`);
      if (result.waking) {
        // ~196s measured. Saying "about four minutes" beats a spinner that
        // looks identical at second 5 and second 190.
        console.log(
          `Waking up -- about ${Math.ceil((result.etaSeconds ?? 240) / 60)} minutes.`,
        );
      }
      return 0;
    }
  }
}

// ── Entry ────────────────────────────────────────────────────────────────────

const { command, target } = parse(process.argv.slice(2));

if (target.kind === "team") {
  process.exit(await teamCommand(command, target.slug));
}

if (command === "status") {
  console.log(
    target.kind === "local"
      ? "Run `pnpm sb:status` or `supabase status` for the local stack."
      : "Check the Supabase dashboard for the linked project.",
  );
  process.exit(0);
}

const script = DELEGATED[command]?.[target.kind];
if (!script) {
  console.error(`No ${command} for --${target.kind}.`);
  process.exit(1);
}
process.exit(await run(script));
