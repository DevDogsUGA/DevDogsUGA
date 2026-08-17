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
  assertMigrated,
  detectLocalInstance,
  PERSONAS,
  type Instance,
} from "./instance.js";
import { conformance, listApps, quarantineRoundTrip } from "./doctor.js";
import {
  currentRootHolder,
  grantRoot,
  listCandidates,
  transferRoot,
} from "./grantRoot.js";
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
  runEnvAudit,
  runEnvPull,
  runEnvPush,
  runEnvReset,
} from "./env/commands.js";
import { runEnvExample, runEnvInit } from "./env/example.js";
import { DeployError, say } from "./deploy/report.js";
import { renderWriteEnvReport, runDeployWriteEnv } from "./deploy/write-env.js";
import { runDeploySecretsFile } from "./deploy/secrets-file.js";
import { runDeployOrphans } from "./deploy/orphans.js";
import { runMintToken } from "./deploy/mint-token.js";
import { runPreflight } from "./deploy/preflight.js";
import { runRequireToken } from "./deploy/require-token.js";
import { loadRegistry } from "./env/discovery.js";
import { ENV_TARGETS, isEnvTarget } from "@devdogsuga/env";
import { setExplicitAccessToken } from "./bws/client.js";
import { positionals } from "./args.js";
import { resolveVaultTarget } from "./pick.js";
import { bail, errorMessage, explain, renderChecks, unwrap } from "./ui.js";

const DOCTOR_COMMANDS = [
  "doctor",
  "roundtrip",
  "catalog",
  "grant-root",
] as const;
type DoctorCommand = (typeof DOCTOR_COMMANDS)[number];

function isStackCommand(value: string): value is StackCommand {
  return (STACK_COMMANDS as readonly string[]).includes(value);
}

function isDoctorCommand(value: string): value is DoctorCommand {
  return (DOCTOR_COMMANDS as readonly string[]).includes(value);
}

function printHelp(): void {
  console.log(`pnpm devtools [command] [options]

Run with no command to choose from a menu.

Commands:
  setup      Check prerequisites and seed .env — run this first
  link       Start (or connect to) a database and write .env
  push       Apply migrations
  reset      Rebuild the database from migrations, then seeds
  status     Report the target's health
  catalog    List the report reasons and content types in the database
  doctor     Check an app's moderation integration
  roundtrip  File a report against a profile, quarantine it, and check the freeze
  grant-root Give yourself every permission on your own database
  oauth      Configure "Sign in with DevDogs" for the project in this directory
  airtable   Scaffold, pull ids from, or verify the officer base
  env        One env file per target, synced to Bitwarden + GitHub, with a
             drift audit
  deploy     The steps a deploy job runs. Not for a laptop — see below

Airtable subcommands:
  airtable scaffold [--dry-run]   Create what the registry declares
  airtable pull-ids               Write discovered ids into registry.ts
  airtable verify [--no-duplicates]  Diff the live base against the registry
  airtable snapshot [--check]     Refresh, or check, the committed schema snapshot

Env subcommands. One --target, one row, and every per-target fact read
from it:

  --target       file              Bitwarden project      DEPLOY_ENV?
  development    .env              (none)                 yes
  preflight      .env.preflight    devdogs-preflight       no
  staging        .env.staging      devdogs-staging         yes
  production     .env.production   devdogs-production      yes

  env pull  --target <t>          Bitwarden -> that target's file, in place
  env push  --target <t>          that file -> Bitwarden -> GitHub secrets
                                  and variables
  env audit --target <t>          compare the file, Bitwarden, GitHub,
                                  Cloudflare
  env reset                       blank every value in .env, keeping each
                                  commented out
  env example [--check]           regenerate .env.example from the manifests
                                  (--check: verify only, as CI does)
  env init [--target <t>]         create a FRESH file for the target
                                  (default: development); refuses if it exists

  pull, push and audit each READ AND WRITE the target's own file. --file
  overrides that; it is not how you choose a target. --target development
  is refused by all three: .env is your own file and has no Bitwarden
  project behind it.

  preflight is a target but NOT a deploy environment. .env.preflight is a
  staging area for pushing credentials; DEPLOY_ENV=preflight is refused, so
  nothing boots from it.

  init writes what the target actually needs. The development file gets every
  declared key with its development defaults; a vault target's gets only the
  keys a push for it routes, uncommented and blank apart from the $VAR
  derivations — a development default or a placeholder is non-empty, so
  prefilling one would push it to that environment.

  Leave --target off and it asks. Naming it is for scripts, and for anyone
  who would rather not be asked twice.

  Bitwarden is the source of truth for a WHOLE target, secret and
  public alike; deploy jobs read GitHub, so push sends to both — a value in
  one and not the other is the failure this design has. On GitHub the split
  matters: secrets go to the secret store, the public per-environment values
  (PROJECT_REF, BASE_URL, PUBLISHABLE_KEY, ...) to the variable store, where
  logs do not mask them and audit can compare their values. Needs a
  signed-in GitHub CLI.

  The Secrets Manager access token is looked for in four places, in order:
  --access-token, then BWS_ACCESS_TOKEN, then your Bitwarden Password
  Manager vault (via the bw CLI), and finally by asking — with an offer to
  save it to the vault so it only has to be typed once. Prefer the vault or
  the environment: --access-token is visible to ps and lands in shell
  history.

  Edits the target's file in place, preserving comments and order. Values are
  commented out rather than deleted. Overwrites are confirmed separately from
  additions, and production is confirmed on top of that. Values are never
  printed — changes show as key names and fingerprints.

  pull and push stamp each line with the target and date, so a file that
  has been sitting for weeks says so. Same-named lines are grouped together on
  every write. reset is local-only and takes no --target.

Deploy subcommands. Steps of .github/workflows/deploy.yaml, run in order by a
job that has already set DEPLOY_ENV:

  deploy write-env [--source <manifest>]
                                  compose .env.<DEPLOY_ENV> from the GitHub
                                  environment's secrets and variables
  deploy secrets-file --app <app> [--mint]
                                  write the --secrets-file wrangler uploads
                                  with that Worker, into a 0700 temp dir
  deploy orphans [--prune]        report Worker secrets nothing declares
                                  (--prune deletes them; production-apply only)
  deploy preflight                classify the Supabase project before a job
                                  commits to it: paused (skip) vs broken (fail)
  deploy mint-token               sign a fresh sandbox proxy JWT to stdout.
                                  The deploy reaches this through
                                  secrets-file --mint, not by running it
  deploy require-token            exit non-zero, naming who to ask, when
                                  CLOUDFLARE_API_TOKEN is unset

  These print NOTHING to stdout except the one line GitHub has to parse:
  secrets-file's \`::add-mask::\`. No banner, no prompts, no menu — they run
  unattended, and two of them have a stdout something downstream reads.

  ⚠️ write-env, orphans, preflight and require-token must NOT go through
  \`pnpm devtools\`, which is \`with-env tsx src/cli.ts\`. write-env CREATES the
  env file with-env would demand; the other three run in jobs that have none,
  where the wrapper would report a missing FILE rather than the missing TOKEN
  or the paused project. All four use the wrapper-free entry point:

    pnpm --filter @devdogsuga/devtools run cli:no-env deploy write-env

  secrets-file is the opposite: it reads the values write-env composed out of
  the ambient environment, so it wants \`pnpm devtools deploy secrets-file\`.

Database targets (link, push, reset, status) — unrelated to env's --target:
  --local            The Docker stack (default)
  --remote           The linked Supabase project
  --team <slug>      A team's sandbox environment, through the platform

Options:
  --app <slug>       App to check (doctor); skips the picker
  --user <email>     Account to grant Root to (grant-root); skips the picker
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
 * Finds the local stack and checks it has been migrated.
 *
 * These commands only ever run against a local stack, and that is structural
 * rather than a rule they follow: `detectLocalInstance` reads `supabase
 * status`, which describes the Docker stack on this machine and nothing else.
 * There is no remote project for it to return, which is why the tier check that
 * used to sit here — reading a `production` flag out of the database — bought
 * nothing and has been removed along with the table it read.
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
    await assertMigrated(instance);
    s.stop(`Connected to your database at ${instance.apiUrl}`);
  } catch (err) {
    s.stop("Connected, but the schema is not there");
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
          hint: value === "platform" ? "the worked example" : undefined,
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
        "Quarantine freezes a reported profile and resets the display name, and the fixtures were cleaned up.",
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
        "`pnpm devtools reset` rebuilds the database with the seeded personas and the open report they act on.",
      ],
    );
  }
}

/**
 * Grants Root, asking who to if it was not told.
 *
 * Transferring is a separate confirmation from granting, because they are
 * different actions wearing the same name: one gives you a console you did not
 * have, the other takes somebody else's away. `userRoles_root_singleton` means
 * there is no state where both hold it, so the release cannot be skipped.
 */
async function runGrantRoot(
  instance: Instance,
  userEmail?: string,
): Promise<void> {
  let holder: Awaited<ReturnType<typeof currentRootHolder>>;
  let candidates: Awaited<ReturnType<typeof listCandidates>>;

  try {
    [holder, candidates] = await Promise.all([
      currentRootHolder(instance),
      listCandidates(instance),
    ]);
  } catch (err) {
    explain("Could not read the current roles.", errorMessage(err));
    process.exitCode = 1;
    return;
  }

  if (candidates.length === 0) {
    explain("There are no accounts on this database yet.", "", [
      "Sign in once through the app, then run this again.",
      `Or use a seeded persona: ${PERSONAS.member}, password \`password\`.`,
    ]);
    return;
  }

  const chosen =
    userEmail ??
    unwrap(
      await select({
        message: "Which account should hold Root?",
        options: candidates.map((c) => ({
          value: c.email,
          label: c.email,
          hint: c.userId === holder?.userId ? "holds it now" : undefined,
        })),
      }),
    );

  const target = candidates.find((c) => c.email === chosen);

  if (!target) {
    explain(`No account on this database has the address ${chosen}.`, "", [
      "Run without --user to pick from a list.",
    ]);
    process.exitCode = 1;
    return;
  }

  if (holder?.userId === target.userId) {
    log.info(`${target.email} already holds Root.`);
    return;
  }

  try {
    if (holder) {
      const confirmed = unwrap(
        await confirm({
          message: `Root is held by ${holder.email}. Take it away and give it to ${target.email}?`,
          initialValue: false,
        }),
      );
      if (!confirmed) bail("Left Root where it was.");
      await transferRoot(instance, holder.userId, target.userId);
    } else {
      await grantRoot(instance, target.userId);
    }
    log.success(
      `${target.email} now holds Root, which confers every permission. ` +
        "Sign out and back in if the console was already open.",
    );
  } catch (err) {
    explain("Could not grant Root.", errorMessage(err), [
      "Seeds create the Root role definition — try `pnpm devtools reset` first.",
    ]);
    process.exitCode = 1;
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
 * `env <pull|push|audit> --target <preflight|staging|production>`, plus the
 * three local-only subcommands: `reset`, `example [--check]`, and
 * `init [--target <target>]`.
 *
 * The target has no default for pull/push/audit, and is asked for when
 * `--target` is absent. Every other command here defaults to the local stack
 * because guessing wrong is free; guessing wrong about whose credentials to
 * overwrite is not. (`init` does default, to development: it refuses to touch
 * an existing file, so the worst a wrong guess can do is create a blank one.)
 *
 * One flag, one vocabulary. `--target` names a row in the target table, and
 * the file, the Bitwarden project and whether `DEPLOY_ENV` may say it all come
 * from that row. Its predecessor `--env` named one of two different enums
 * depending on which subcommand read it, which is why `init --env staging`
 * wrote `.env.staging` while `push --env staging` uploaded `.env`.
 */
async function runEnvCommand(rest: string[]): Promise<void> {
  // `positionals` rather than `rest[0]`, so a flag before the subcommand does
  // not become the subcommand -- and, more to the point, so the VALUE of a flag
  // never does: in `env --file production pull`, `production` is a filename and
  // must not be read as anything else.
  const [sub] = positionals(rest);

  if (
    !sub ||
    !["pull", "push", "audit", "reset", "example", "init"].includes(sub)
  ) {
    log.error(`Unknown env subcommand: ${sub ?? "(none)"}`);
    log.message("Try pull, push, audit, reset, example or init.");
    process.exitCode = 1;
    return;
  }

  // Refused by name rather than ignored. `--env` used to be this flag, and the
  // words it took (`staging`, `production`) are still valid `--target` values,
  // so a stale invocation would otherwise run with NO target — prompting, or
  // failing as "nobody here to ask", neither of which says what changed.
  if (rest.includes("--env")) {
    explain("`--env` is now `--target`.", "", [
      "It named two different things depending on the subcommand: which file",
      "(init) and which Bitwarden project (pull/push/audit). --target names",
      `one row: ${ENV_TARGETS.join(", ")}.`,
      "wrangler, supabase and gh still have their own --env; this is ours.",
    ]);
    process.exitCode = 1;
    return;
  }

  // `reset` only edits a local file. Asking which target to clear it against
  // would imply it reaches one, which is the opposite of what it does.
  if (sub === "reset") {
    try {
      await runEnvReset({
        file: flagValue(rest, "--file"),
        yes: rest.includes("--yes"),
      });
    } catch (err) {
      explain("The reset failed.", errorMessage(err));
      process.exitCode = 1;
    }
    return;
  }

  // Every remaining subcommand reads the registry, which fills only when the
  // env manifests are imported. Loaded HERE, lazily, rather than at CLI
  // start: the import pass touches a manifest in nearly every workspace
  // package, and `pnpm devtools reset` (or any stack command) should not pay
  // for declarations it never reads. `env reset` returned above for the
  // same reason — it edits the local file and consults no key set.
  await loadRegistry();

  // `example` and `init` are pure registry → text. They return BEFORE the
  // Bitwarden token lookup and the pull/push target prompt, and must
  // keep doing so: CI's credential-free validate job runs `example --check`,
  // and a generator that needed a secret to describe the secrets could not
  // live there.
  if (sub === "example") {
    try {
      await runEnvExample({ check: rest.includes("--check") });
    } catch (err) {
      explain("Generating .env.example failed.", errorMessage(err));
      process.exitCode = 1;
    }
    return;
  }

  if (sub === "init") {
    // Every target, including `development` and `preflight`: init maps target
    // → file and nothing else, and every target has a file. It is the one
    // subcommand here that needs no Bitwarden project — though WHAT it writes
    // now depends on the target: see `example.ts`'s header for why a vault
    // target's file is not the development one under a different name.
    const given = flagValue(rest, "--target") ?? "development";
    if (!isEnvTarget(given)) {
      explain(`"${given}" is not a target init can create a file for.`, "", [
        `Pass --target ${ENV_TARGETS.join(" | ")} (default: development).`,
      ]);
      process.exitCode = 1;
      return;
    }
    try {
      await runEnvInit(given);
    } catch (err) {
      explain("env init failed.", errorMessage(err));
      process.exitCode = 1;
    }
    return;
  }

  // The question names the direction, because the answer means something
  // different each way: pull overwrites your file, push overwrites theirs.
  const target = await resolveVaultTarget(
    flagValue(rest, "--target"),
    sub === "pull"
      ? "Which target should I pull into its env file?"
      : sub === "push"
        ? "Which target should I push its env file to?"
        : "Which target should I audit?",
  );
  if (!target) {
    process.exitCode = 1;
    return;
  }

  // Before any command runs, so every `bws` call in it sees the same token.
  setExplicitAccessToken(flagValue(rest, "--access-token"));

  const options = {
    target,
    file: flagValue(rest, "--file"),
    yes: rest.includes("--yes"),
  };

  try {
    if (sub === "pull") await runEnvPull(options);
    else if (sub === "push") await runEnvPush(options);
    else await runEnvAudit(options);
  } catch (err) {
    explain("The env command failed.", errorMessage(err), [
      "The access token is read from --access-token, then BWS_ACCESS_TOKEN,",
      "then your Bitwarden vault, and finally by asking.",
      "`gh auth status` shows whether the GitHub CLI is signed in.",
    ]);
    process.exitCode = 1;
  }
}

// ── Deploy ───────────────────────────────────────────────────────────────────

/**
 * `deploy <write-env | secrets-file | orphans | preflight | mint-token |
 * require-token>` — the steps of a deploy job.
 *
 * These were three files in `scripts/` that imported devtools' own sources
 * through a relative path, which is why `scripts/` needed a tsconfig and a CI
 * typecheck step of its own. They are devtools commands now, and get the
 * documentation, refusals and named errors the rest of the CLI has.
 *
 * ## ⚠️ Dispatched BEFORE `intro()`, and it never calls `outro()`
 *
 * Every `@clack/prompts` writer — `intro`, `outro`, `log.*`, `note`, the
 * spinner — writes to STDOUT (measured; see `deploy/report.ts`). Two commands
 * in this group have a stdout something downstream parses: `secrets-file`
 * emits `::add-mask::<token>`, which GitHub recognises only on a line of its
 * own, and `mint-token` emits a signed JWT that its caller takes whole. A
 * banner on that stream is not cosmetic — it is an unmasked production
 * credential in a public repository's job log, or a Worker secret with a box
 * drawing character in it.
 *
 * So: no `intro`, no `outro`, and nothing in `deploy/` may use `log`, `note`
 * or `explain`. Failures render through `say()`, which is stderr.
 *
 * Nothing here prompts either. There is nobody to ask on a runner, and a
 * command that fell back to a prompt would hang the job rather than fail it.
 */
async function runDeployCommand(rest: string[]): Promise<void> {
  // `positionals` rather than `rest[0]`, for the reason its own module gives:
  // the value of a flag must never be read as a subcommand. Here that would be
  // `--source production orphans` selecting a subcommand from a manifest name.
  const [sub] = positionals(rest);

  if (!sub) {
    say([
      "devtools deploy: which step?",
      "  write-env [--source <manifest>]   compose .env.<DEPLOY_ENV>",
      "  secrets-file --app <app> [--mint] compose the Worker secrets file",
      "  orphans [--prune]                 audit Worker secrets nothing declares",
      "  preflight                         classify the project (paused vs broken)",
      "  mint-token                        sign a fresh sandbox proxy JWT",
      "  require-token                     refuse to deploy without a CF token",
    ]);
    process.exitCode = 1;
    return;
  }

  try {
    // ── Registry-free steps, dispatched FIRST ──────────────────────────────
    //
    // None of these three reads a declaration, and two of them are the ones
    // that must stay quick: `require-token` is a guard standing in front of a
    // deploy, and `preflight` classifies a paused project before a job decides
    // whether to run at all. Loading the registry would import a manifest from
    // nearly every workspace package to answer a question none of them asks.
    if (sub === "require-token") {
      runRequireToken();
      return;
    }

    // Healthy AND paused both exit 0 — a paused staging project is the
    // expected state, not a failure, and the verdict it returns is what the
    // calling job reads. Anything else throws, and the catch below makes it a
    // non-zero exit. See the module for why only HTTP 540 is a skip.
    if (sub === "preflight") {
      await runPreflight();
      return;
    }

    // Reachable by hand for a rotation, but the deploy does NOT come through
    // here: `secrets-file` calls `runMintToken` in-process with a collecting
    // sink, which is what removed stdout-as-a-credential-channel from the
    // pipeline entirely. Run directly, stdout is still the bare JWT.
    if (sub === "mint-token") {
      runMintToken();
      return;
    }

    // The registry fills only when the manifests are imported, and all three of
    // these derive their whole key set from it. Loaded here rather than at CLI
    // start for the reason `runEnvCommand` gives: the import pass touches a
    // manifest in nearly every workspace package.
    await loadRegistry();

    if (sub === "write-env") {
      // Parsed here rather than with `flagValue`, which cannot tell "absent"
      // from "given something that looks like a flag" — and `--source --mint`
      // silently composing EVERYTHING instead of one manifest's slice is the
      // difference between a narrow config push and a full credential set.
      const index = rest.indexOf("--source");
      const source = index === -1 ? null : rest[index + 1];
      if (index !== -1 && (!source || source.startsWith("--"))) {
        throw new DeployError(
          "--source needs a manifest name, e.g. --source supabase.",
        );
      }

      const result = await runDeployWriteEnv({ source });
      say(renderWriteEnvReport(result));
      return;
    }

    if (sub === "secrets-file") {
      const app = flagValue(rest, "--app");
      if (!app) {
        throw new DeployError("--app <name> is required.", [
          "It names the workspace app whose manifest declares the Worker's",
          "secrets — platform, schedule-builder or sandbox.",
        ]);
      }

      // `--mint` takes no value now. Refused by name rather than ignored: the
      // old form named a script to run and take the stdout of, so a stale
      // `--mint scripts/mint-sandbox-token.mjs` left as-is would silently drop
      // the path, mint through the sibling command, and look like it worked —
      // or, worse, keep working as a way to name any executable on the runner.
      const mintIndex = rest.indexOf("--mint");
      const after = mintIndex === -1 ? undefined : rest[mintIndex + 1];
      if (after !== undefined && !after.startsWith("--")) {
        throw new DeployError("`--mint` no longer takes a script path.", [
          `Drop the "${after}" after it. There is one minting command in this`,
          "repository — `devtools deploy mint-token` — and this runs it; which",
          "variable it fills is derived from the app's manifest, not passed in.",
        ]);
      }

      await runDeploySecretsFile({ app, mint: mintIndex !== -1 });
      return;
    }

    if (sub === "orphans") {
      await runDeployOrphans({ prune: rest.includes("--prune") });
      return;
    }

    say([
      `devtools deploy: unknown subcommand "${sub}".`,
      "  Try write-env, secrets-file, orphans, preflight, mint-token or",
      "  require-token.",
    ]);
    process.exitCode = 1;
  } catch (err) {
    // stderr, not `explain()`. See the header.
    say(
      err instanceof DeployError
        ? [
            `devtools deploy ${sub}: ${err.message}`,
            ...err.detail.map((line) => `  ${line}`),
          ]
        : [`devtools deploy ${sub}: ${errorMessage(err)}`],
    );
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
          value: "grant-root" as const,
          label: "Give myself the console",
          hint: "grants Root on your own database",
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
    await runSetup();
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
  else if (choice === "grant-root") await runGrantRoot(instance);
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

  // ⚠️ BEFORE `intro()`, and this ordering is load-bearing rather than tidy.
  // `intro` writes to STDOUT, and `deploy secrets-file` / `deploy mint-token`
  // have a stdout that GitHub and this CLI respectively PARSE. See the header
  // on `runDeployCommand`. It returns without an `outro()` for the same
  // reason.
  if (first === "deploy") {
    await runDeployCommand(rest);
    return;
  }

  intro("DevDogs devtools");

  if (!first) {
    await menu();
    outro("Done.");
    return;
  }

  if (first === "setup") {
    await runSetup();
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

  if (first === "env") {
    await runEnvCommand(rest);
    outro("Done.");
    return;
  }

  // The old name, refused with the new one rather than falling into "Unknown
  // command". It is in this repo's own docs, scripts and shell histories, and
  // the rename came with a flag rename, so a bare "unknown" would leave both
  // halves to be rediscovered.
  if (first === "secrets") {
    explain("`secrets` is now `env`.", "", [
      "pnpm devtools env <pull|push|audit|reset|example|init>",
      "`--env` is now `--target`, for the same reason: one name, one meaning.",
    ]);
    process.exitCode = 1;
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
  } else if (first === "grant-root") {
    await runGrantRoot(instance, flagValue(rest, "--user"));
  } else {
    await runRoundTrip(instance);
  }

  outro("Done.");
}

main().catch((err: unknown) => {
  log.error(errorMessage(err));
  process.exit(1);
});
