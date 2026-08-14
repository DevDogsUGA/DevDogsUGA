#!/usr/bin/env tsx
/**
 * `pnpm devtools [command] [--local | --remote | --team <slug>]`
 *
 * Run it with no arguments and it opens a menu. That is the point: a
 * contributor should be able to set up a database and check their moderation
 * integration without knowing a single command name, and without reading this
 * file first.
 *
 * The subcommands still exist for anyone who does know them, and for CI, which
 * cannot answer a prompt.
 */
import {
  confirm,
  intro,
  log,
  note,
  outro,
  select,
  spinner,
} from "@clack/prompts";
import {
  assertNotProduction,
  detectLocalInstance,
  PERSONAS,
  type Instance,
} from "./instance.js";
import { conformance, listApps, quarantineRoundTrip } from "./doctor.js";
import {
  runStackCommand,
  STACK_COMMANDS,
  type StackCommand,
  type Target,
} from "./stack.js";
import { runOAuthSetup } from "./oauth/wizard.js";
import { runSetup } from "./setup.js";
import {
  runAirtable,
  runPullIds,
  runScaffold,
  runSnapshot,
  runVerify,
} from "./airtable/commands.js";
import { readCatalog, renderCatalog } from "./catalog.js";
import {
  runSecretsAudit,
  runSecretsPull,
  runSecretsPush,
  runSecretsReset,
} from "./env/commands.js";
import { setExplicitAccessToken } from "./bws/client.js";
import { positionals } from "./args.js";
import { resolveEnvironment } from "./pick.js";
import { bail, errorMessage, explain, renderChecks, unwrap } from "./ui.js";

const DOCTOR_COMMANDS = ["doctor", "roundtrip", "catalog"] as const;
type DoctorCommand = (typeof DOCTOR_COMMANDS)[number];

function isStackCommand(value: string): value is StackCommand {
  return (STACK_COMMANDS as readonly string[]).includes(value);
}

function isDoctorCommand(value: string): value is DoctorCommand {
  return (DOCTOR_COMMANDS as readonly string[]).includes(value);
}

function printHelp(): void {
  console.log(`pnpm devtools [command] [target]

Run with no command to choose from a menu.

Commands:
  setup      Check prerequisites and seed .env — run this first
  link       Start (or connect to) a database and write .env
  push       Apply migrations
  reset      Rebuild the database from migrations, then seeds
  status     Report the target's health
  catalog    List the report reasons and content types in the database
  doctor     Check an app's moderation integration
  roundtrip  File a report, quarantine it, and check who can still see it
  oauth      Configure "Sign in with DevDogs" for the project in this directory
  airtable   Scaffold, pull ids from, or verify the officer base
  secrets    One .env, synced to Bitwarden + GitHub, with a drift audit

Airtable subcommands:
  airtable scaffold [--dry-run]   Create what the registry declares
  airtable pull-ids               Write discovered ids into registry.ts
  airtable verify [--no-duplicates]  Diff the live base against the registry
  airtable snapshot [--check]     Refresh, or check, the committed schema snapshot

Secrets subcommands (--env is dry-run, staging or production):
  secrets pull  --env <env>       Bitwarden -> your .env, in place
  secrets push  --env <env>       your .env -> Bitwarden -> GitHub
  secrets audit --env <env>       compare .env, Bitwarden, GitHub, Cloudflare
  secrets reset                   blank every value, keeping each commented out

  Leave --env off and it asks. Naming it is for scripts, and for anyone who
  would rather not be asked twice.

  Bitwarden is the source of truth; deploy jobs read GitHub Actions secrets,
  so push sends to both — a value in one and not the other is the failure
  this design has. Needs a signed-in GitHub CLI.

  The Secrets Manager access token is looked for in four places, in order:
  --access-token, then BWS_ACCESS_TOKEN, then your Bitwarden Password
  Manager vault (via the bw CLI), and finally by asking — with an offer to
  save it to the vault so it only has to be typed once. Prefer the vault or
  the environment: --access-token is visible to ps and lands in shell
  history.

  Edits the root .env in place, preserving comments and order. Values are
  commented out rather than deleted. Overwrites are confirmed separately from
  additions, and production is confirmed on top of that. Values are never
  printed — changes show as key names and fingerprints.

  pull and push stamp each line with the environment and date, so a .env that
  has been sitting for weeks says so. Same-named lines are grouped together on
  every write. reset is local-only and takes no --env.

Targets:
  --local            The Docker stack (default)
  --remote           The linked Supabase project
  --team <slug>      A team's sandbox environment, through the platform

Options:
  --app <slug>       App to check (doctor); skips the picker
  --base-url <url>   DevDogs API URL (oauth); skips the prompt
  --help, -h         Show this message`);
}

function parseTarget(rest: string[]): Target {
  const teamIndex = rest.indexOf("--team");
  if (teamIndex !== -1) {
    const slug = rest[teamIndex + 1];
    if (!slug || slug.startsWith("--")) {
      console.error("--team needs a slug: pnpm devtools link --team lantern");
      process.exit(1);
    }
    return { kind: "team", slug };
  }
  return rest.includes("--remote") ? { kind: "remote" } : { kind: "local" };
}

function flagValue(rest: string[], flag: string): string | undefined {
  const index = rest.indexOf(flag);
  if (index === -1) return undefined;
  const value = rest[index + 1];
  return value && !value.startsWith("--") ? value : undefined;
}

// ── Connecting ───────────────────────────────────────────────────────────────

/**
 * Finds the local stack and refuses production, explaining either failure.
 *
 * The doctor commands only ever run against a local stack: they sign in as
 * seeded personas and write fixture rows, neither of which exists on a remote
 * project unless somebody seeded one, and both of which would be alarming if
 * they did.
 */
async function connect(): Promise<Instance | null> {
  const s = spinner();
  s.start("Looking for your database");

  let instance: Instance;
  try {
    instance = detectLocalInstance();
  } catch (err) {
    s.stop("Could not find a running database");
    explain("The local Supabase stack is not reachable.", errorMessage(err), [
      "1. Make sure Docker is running",
      "2. Run `pnpm devtools link` (or choose Start database from the menu)",
      "3. Confirm with `supabase status`",
    ]);
    return null;
  }

  try {
    const environment = await assertNotProduction(instance);
    s.stop(`Connected to your ${environment} database at ${instance.apiUrl}`);
  } catch (err) {
    s.stop("Refused to connect");
    explain("That instance cannot be used here.", errorMessage(err), [
      "Run `pnpm devtools reset` to rebuild your own database from migrations and seeds.",
    ]);
    return null;
  }

  return instance;
}

// ── Commands ─────────────────────────────────────────────────────────────────

async function runStack(command: StackCommand, target: Target): Promise<void> {
  // `reset` drops everything. Worth a question, since the menu puts it one
  // keystroke away from the harmless commands.
  if (command === "reset") {
    const confirmed = unwrap(
      await confirm({
        message:
          target.kind === "local"
            ? "This erases your local database and rebuilds it. Continue?"
            : `This erases the ${target.kind} database and rebuilds it. Continue?`,
        initialValue: target.kind === "local",
      }),
    );
    if (!confirmed) bail("Left the database alone.");
  }

  try {
    const { code, lines } = await runStackCommand(command, target);
    for (const line of lines) log.message(line);
    if (code !== 0) {
      explain(`\`${command}\` did not finish cleanly.`, "", [
        "Scroll up for the output from the Supabase CLI.",
      ]);
      process.exitCode = code;
    }
  } catch (err) {
    explain(`\`${command}\` failed.`, errorMessage(err));
    process.exitCode = 1;
  }
}

async function runCatalog(instance: Instance): Promise<void> {
  const catalog = await readCatalog(instance);
  note(renderCatalog(catalog), "Moderation catalog");
}

async function runDoctor(instance: Instance, appSlug?: string): Promise<void> {
  let slug = appSlug;

  if (!slug) {
    const apps = await listApps(instance);
    slug = unwrap(
      await select({
        message: "Which app should I check?",
        options: apps.map((value) => ({
          value,
          label: value,
          hint: value === "sandbox" ? "the worked example" : undefined,
        })),
      }),
    );
  }

  const s = spinner();
  s.start(`Checking ${slug}`);

  let types: Awaited<ReturnType<typeof conformance>>;
  try {
    types = await conformance(instance, slug);
    s.stop(`Checked ${slug}`);
  } catch (err) {
    s.stop("The check could not run");
    explain("conformance_check() failed.", errorMessage(err), [
      `Signing in as ${PERSONAS.moderator} needs the seeds — try \`pnpm devtools reset\`.`,
    ]);
    return;
  }

  if (types.length === 0) {
    note(
      `${slug} has no moderatable content types.\n\n` +
        "A table becomes one by carrying a foreign key to\n" +
        'platform."reportResolutions" -- adding that column is the whole\n' +
        "registration. See docs/platform/reporting-and-feedback.md.",
      "Nothing to check",
    );
    return;
  }

  let failures = 0;
  for (const type of types) {
    const failed = type.checks.filter((c) => !c.ok).length;
    failures += failed;
    note(
      renderChecks(type.checks),
      `${type.tableName} → "${type.contentType}"`,
    );
  }

  if (failures === 0) {
    log.success(`${slug} looks correctly integrated.`);
  } else {
    log.warn(
      `${failures} check${failures === 1 ? "" : "s"} failed. The last two are ` +
        "heuristics over policy text, so a failure there is worth reading rather " +
        "than trusting outright.",
    );
  }
}

async function runRoundTrip(instance: Instance): Promise<void> {
  const s = spinner();
  s.start("Filing a report, quarantining it, and looking again");

  try {
    const steps = await quarantineRoundTrip(instance);
    s.stop("Round-trip finished");

    note(renderChecks(steps), "What happened");

    const failed = steps.filter((step) => !step.ok);
    if (failed.length === 0) {
      log.success(
        "Quarantine hides content from other users, and the fixtures were cleaned up.",
      );
    } else {
      log.warn(
        `${failed.length} step${failed.length === 1 ? "" : "s"} did not hold. ` +
          "The fixtures were still cleaned up.",
      );
    }
  } catch (err) {
    s.stop("The round-trip could not run");
    explain(
      "Something went wrong before the checks could finish.",
      errorMessage(err),
      [
        "`pnpm devtools reset` rebuilds the database with the seeded personas and sandbox content.",
      ],
    );
  }
}

// ── Airtable ─────────────────────────────────────────────────────────────────

/**
 * Runs one of the three base commands, asking which if it was not told.
 *
 * The order in the picker is the runbook order, and the hints say what each one
 * writes to: these touch a base officers use every day, so "which of these is
 * safe to run right now" has to be answerable from the menu alone.
 */
async function runAirtableCommand(rest: string[]): Promise<void> {
  const sub =
    rest.find((arg) => !arg.startsWith("--")) ??
    unwrap(
      await select({
        message: "What should I do with the Airtable base?",
        options: [
          {
            value: "verify",
            label: "Check the base against the registry",
            hint: "reads only — start here",
          },
          {
            value: "scaffold",
            label: "Create missing tables and fields",
            hint: "writes to the base",
          },
          {
            value: "pull-ids",
            label: "Write discovered ids into registry.ts",
            hint: "edits a committed source file",
          },
        ],
      }),
    );

  if (sub === "verify") {
    // Duplicate detection reads every record in every table, which is the
    // expensive part of a verify and pointless on a base with no rows yet.
    await runAirtable(() => runVerify(!rest.includes("--no-duplicates")));
    return;
  }
  if (sub === "scaffold") {
    await runAirtable(() => runScaffold(rest.includes("--dry-run")));
    return;
  }
  if (sub === "pull-ids") {
    await runAirtable(() => runPullIds());
    return;
  }
  if (sub === "snapshot") {
    // `--check` is credential-free and is what pull-request CI runs; the
    // default refreshes the committed file and needs the token.
    await runAirtable(() => runSnapshot(rest.includes("--check")));
    return;
  }

  log.error(`Unknown airtable subcommand: ${sub}`);
  log.message("Try scaffold, pull-ids, verify or snapshot.");
  process.exitCode = 1;
}

/**
 * `secrets <pull|push|audit> --env <dry-run|staging|production>`
 *
 * The environment has no default, and is asked for when `--env` is absent.
 * Every other command here defaults to the local stack because guessing wrong
 * is free; guessing wrong about whose credentials to overwrite is not.
 */
async function runSecretsCommand(rest: string[]): Promise<void> {
  // `positionals` rather than `rest[0]`, so a flag before the subcommand does
  // not become the subcommand -- and, more to the point, so the VALUE of a flag
  // never does: in `secrets --file production pull`, `production` is a
  // filename and must not be read as anything else.
  const [sub] = positionals(rest);

  if (!sub || !["pull", "push", "audit", "reset"].includes(sub)) {
    log.error(`Unknown secrets subcommand: ${sub ?? "(none)"}`);
    log.message("Try pull, push, audit or reset.");
    process.exitCode = 1;
    return;
  }

  // `reset` only edits the local file. Asking which environment to clear it
  // against would imply it reaches one, which is the opposite of what it does.
  if (sub === "reset") {
    try {
      await runSecretsReset({
        file: flagValue(rest, "--file"),
        yes: rest.includes("--yes"),
      });
    } catch (err) {
      explain("The reset failed.", errorMessage(err));
      process.exitCode = 1;
    }
    return;
  }

  // The question names the direction, because the answer means something
  // different each way: pull overwrites your file, push overwrites theirs.
  const environment = await resolveEnvironment(
    flagValue(rest, "--env"),
    sub === "pull"
      ? "Which environment should I pull into your .env?"
      : sub === "push"
        ? "Which environment should I push your .env to?"
        : "Which environment should I audit?",
  );
  if (!environment) {
    process.exitCode = 1;
    return;
  }

  // Before any command runs, so every `bws` call in it sees the same token.
  setExplicitAccessToken(flagValue(rest, "--access-token"));

  const options = {
    environment,
    file: flagValue(rest, "--file"),
    yes: rest.includes("--yes"),
  };

  try {
    if (sub === "pull") await runSecretsPull(options);
    else if (sub === "push") await runSecretsPush(options);
    else await runSecretsAudit(options);
  } catch (err) {
    explain("The secrets command failed.", errorMessage(err), [
      "The access token is read from --access-token, then BWS_ACCESS_TOKEN,",
      "then your Bitwarden vault, and finally by asking.",
      "`gh auth status` shows whether the GitHub CLI is signed in.",
    ]);
    process.exitCode = 1;
  }
}

// ── Menu ─────────────────────────────────────────────────────────────────────

async function menu(): Promise<void> {
  const choice = unwrap(
    await select({
      message: "What would you like to do?",
      options: [
        {
          value: "setup" as const,
          label: "Set up my machine",
          hint: "check prerequisites and create .env — start here",
        },
        {
          value: "link" as const,
          label: "Start my database",
          hint: "boots the local stack and writes .env",
        },
        {
          value: "reset" as const,
          label: "Reset my database",
          hint: "rebuild from migrations, then seeds",
        },
        {
          value: "push" as const,
          label: "Apply new migrations",
          hint: "without erasing anything",
        },
        {
          value: "catalog" as const,
          label: "Show what can be reported",
          hint: "report reasons and content types on this instance",
        },
        {
          value: "doctor" as const,
          label: "Check an app's moderation setup",
          hint: "what the catalog derived, and whether it holds up",
        },
        {
          value: "roundtrip" as const,
          label: "Test reporting end to end",
          hint: "file, quarantine, and check who can still see it",
        },
        {
          value: "oauth" as const,
          label: 'Set up "Sign in with DevDogs"',
          hint: "configures the Supabase project in this directory",
        },
        {
          value: "airtable" as const,
          label: "Work on the Airtable base",
          hint: "scaffold, pull ids, or check for drift",
        },
      ],
    }),
  );

  if (choice === "setup") {
    runSetup();
    return;
  }

  if (choice === "airtable") {
    await runAirtableCommand([]);
    return;
  }

  if (isStackCommand(choice)) {
    await runStack(choice, { kind: "local" });
    return;
  }

  if (choice === "oauth") {
    await runOAuthSetup();
    return;
  }

  const instance = await connect();
  if (!instance) return;

  if (choice === "catalog") await runCatalog(instance);
  else if (choice === "doctor") await runDoctor(instance);
  else await runRoundTrip(instance);
}

// ── Entry ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  if (argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    return;
  }

  const [first, ...rest] = argv;

  intro("DevDogs devtools");

  if (!first) {
    await menu();
    outro("Done.");
    return;
  }

  if (first === "setup") {
    runSetup();
    outro("Done.");
    return;
  }

  if (first === "oauth") {
    await runOAuthSetup(flagValue(rest, "--base-url"));
    outro('All done! You\'re ready to "Sign in with DevDogs".');
    return;
  }

  if (first === "airtable") {
    await runAirtableCommand(rest);
    outro("Done.");
    return;
  }

  if (first === "secrets") {
    await runSecretsCommand(rest);
    outro("Done.");
    return;
  }

  if (!isStackCommand(first) && !isDoctorCommand(first)) {
    log.error(`Unknown command: ${first}`);
    printHelp();
    process.exitCode = 1;
    return;
  }

  if (isStackCommand(first)) {
    await runStack(first, parseTarget(rest));
    outro("Done.");
    return;
  }

  const instance = await connect();
  if (!instance) {
    process.exitCode = 1;
    return;
  }

  if (first === "catalog") {
    await runCatalog(instance);
  } else if (first === "doctor") {
    await runDoctor(instance, flagValue(rest, "--app"));
  } else {
    await runRoundTrip(instance);
  }

  outro("Done.");
}

main().catch((err: unknown) => {
  log.error(errorMessage(err));
  process.exit(1);
});
