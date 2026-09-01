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
 *
 * ## Three files, one tree
 *
 * `commands.ts` holds the command tree as data. `help.ts` renders one level of
 * it at a time, and `menu.ts` walks it into an argv that comes back through
 * `dispatch()` below, the same entry a typed command line takes. That is why
 * the menu covers everything the CLI does: there is no second list of commands
 * anywhere, so there is nothing to fall out of step.
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
  runApply,
  runCheck,
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
import { runDeployAirtablePlan } from "./deploy/airtable-plan.js";
import { runDeployAirtableApply } from "./deploy/airtable-apply.js";
import { runPreflight } from "./deploy/preflight.js";
import { runRequirePlanner } from "./deploy/require-planner.js";
import { runRequireToken } from "./deploy/require-token.js";
import {
  runPlannerCreate,
  runPlannerDrop,
  runPlannerResetPassword,
  runPlannerStatus,
} from "./planner/commands.js";
import {
  runSigningKeyGenerate,
  runSigningKeyImport,
  runSigningKeyStatus,
} from "./signing-key/commands.js";
import { loadRegistry } from "./env/discovery.js";
import { ENV_TARGETS, isEnvTarget } from "@devdogsuga/env";
import { setExplicitAccessToken } from "./bws/client.js";
import { positionals } from "./args.js";
import { resolveVaultTarget } from "./pick.js";
import { bail, errorMessage, explain, renderChecks, unwrap } from "./ui.js";
import { helpPath, renderHelp } from "./help.js";
import { findCommand, subcommandList, subcommandNames } from "./commands.js";
import { runMenu } from "./menu.js";
import { runDocsIndex } from "./docs/index-pages.js";
import { runTask } from "./run/pick.js";
import { runBw } from "./bws/bw.js";
import { runImages } from "./images/commands.js";
import { runQr } from "./qr/commands.js";

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
 * There is no remote project for it to return, so the tier check that used to
 * sit here, reading a `production` flag out of the database, bought nothing and
 * has been removed along with the table it read.
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
      "2. Run `pnpm devtools link` (or choose Supabase → link in the menu)",
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
      // Lines on a failure ARE the explanation, which is the contract with
      // `runStackCommand`. "Scroll up for the Supabase CLI's output" is only
      // true when a delegated script ran, and pointing a reader at output that
      // does not exist is worse than adding nothing. A failure with scrollback
      // worth reading says so in its own line.
      if (lines.length === 0) {
        explain(`\`${command}\` did not finish cleanly.`, "", [
          "Scroll up for the output from the Supabase CLI.",
        ]);
      }
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
 * The picker is ordered least dangerous first, and the hints say what each one
 * touches: these run against a base officers use every day, so "which of these
 * is safe to run right now" has to be answerable from the menu alone.
 */
async function runAirtableCommand(rest: string[]): Promise<void> {
  const sub =
    rest.find((arg) => !arg.startsWith("--")) ??
    unwrap(
      await select({
        message: "What should I do with the Airtable base?",
        options: [
          {
            value: "check",
            label: "Check the registry against the committed snapshot",
            hint: "no token, no network — what CI runs",
          },
          {
            value: "verify",
            label: "Diff the live base against the registry",
            hint: "reads the base — start here",
          },
          {
            value: "apply",
            label: "Bring the base up to the registry, then write back",
            hint: "writes the base AND two committed files",
          },
        ],
      }),
    );

  if (sub === "check") {
    await runAirtable(() => {
      runCheck();
    });
    return;
  }
  if (sub === "verify") {
    // Duplicate detection reads every record in every table, which is the
    // expensive part of a verify and pointless on a base with no rows yet.
    await runAirtable(() => runVerify(!rest.includes("--no-duplicates")));
    return;
  }
  if (sub === "apply") {
    await runAirtable(() => runApply(rest.includes("--dry-run")));
    return;
  }

  log.error(`Unknown airtable subcommand: ${sub}`);
  log.message(`Try ${subcommandList(["airtable"])}.`);
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

  // Validated against the command tree rather than a list kept here. One
  // declaration means a subcommand cannot exist in the CLI and be missing
  // from the menu, or the reverse.
  if (!sub || !subcommandNames(["env"]).includes(sub)) {
    log.error(`Unknown env subcommand: ${sub ?? "(none)"}`);
    log.message(`Try ${subcommandList(["env"])}.`);
    process.exitCode = 1;
    return;
  }

  // Refused by name rather than ignored. `--env` used to be this flag, and the
  // words it took (`staging`, `production`) are still valid `--target` values,
  // so a stale invocation would otherwise run with NO target: prompting, or
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
  // same reason: it edits the local file and consults no key set.
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
    // subcommand here that needs no Bitwarden project, though WHAT it writes
    // now depends on the target. See `example.ts`'s header for why a vault
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
      // `--apps` (development only): which projects' sections to render, as
      // comma-separated app names, plus `devtools` for the operator role.
      // Absent at a terminal, init asks; absent in a pipe, it renders
      // everything, which is what every pre-picker caller got.
      await runEnvInit(given, flagValue(rest, "--apps") ?? undefined);
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
 * require-token | airtable-plan | airtable-apply>`: the steps of a deploy job.
 *
 * The first SIX were files in `scripts/` that imported devtools' own sources
 * through a relative path, which is why `scripts/` needed a tsconfig and a CI
 * typecheck step of its own. They are devtools commands now, and get the
 * documentation, refusals and named errors the rest of the CLI has. The two
 * Airtable steps were never in `scripts/`: they are new work, filling the
 * §3.5 gap the deploy workflow used to describe in a comment.
 *
 * ## ⚠️ Dispatched BEFORE `intro()`, and it never calls `outro()`
 *
 * Every `@clack/prompts` writer writes to STDOUT: `intro`, `outro`, `log.*`,
 * `note`, the spinner (measured; see `deploy/report.ts`). Two commands
 * in this group have a stdout something downstream parses: `secrets-file`
 * emits `::add-mask::<token>`, which GitHub recognises only on a line of its
 * own, and `mint-token` emits a signed JWT that its caller takes whole. A
 * banner on that stream is not cosmetic. It is an unmasked production
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
    // Rendered from the command tree, on stderr like every other word this
    // group prints. `renderHelp` would be the obvious call, but it returns
    // one string for stdout, and stdout here is a credential channel.
    const steps = subcommandNames(["deploy"]);
    const width = Math.max(...steps.map((name) => name.length)) + 2;
    say([
      "devtools deploy: which step?",
      ...steps.map(
        (name) =>
          `  ${name.padEnd(width)}${findCommand(["deploy", name])!.summary}`,
      ),
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

    // Registry-free like its sibling guards: the main-plan job holds one
    // credential in the step's env: block and composes no file. What it
    // checks, that DB_URL is the planner role and no more, is the one property
    // of the preflight tier nothing at rest can verify.
    if (sub === "require-planner") {
      await runRequirePlanner();
      return;
    }

    // Healthy AND paused both exit 0: a paused staging project is the expected
    // state, not a failure, and the verdict it returns is what the calling job
    // reads. Anything else throws, and the catch below makes it a
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

    // Registry-free for the same reason, and it matters more here than
    // anywhere else in this group: both run in jobs that hold ONE narrow
    // Airtable credential and compose no env file, so loading the manifests
    // would import a declaration from nearly every workspace package to answer
    // a question neither asks. Which base and which token is all they read,
    // and both arrive from the workflow's `env:` block.
    //
    // ⚠️ Two commands rather than one with a `--dry-run` flag. The plan runs
    // from `main`, where a write-capable credential must never be in scope, so
    // "reads only" has to be a property of the code path rather than of an
    // argument somebody could get wrong. `deploy/airtable-plan.ts` has no
    // import of `scaffoldBase` at all. A flag would make the safe case one
    // typo away from the unsafe one.
    if (sub === "airtable-plan") {
      await runDeployAirtablePlan();
      return;
    }

    if (sub === "airtable-apply") {
      await runDeployAirtableApply();
      return;
    }

    // The registry fills only when the manifests are imported, and all three of
    // these derive their whole key set from it. Loaded here rather than at CLI
    // start for the reason `runEnvCommand` gives: the import pass touches a
    // manifest in nearly every workspace package.
    await loadRegistry();

    if (sub === "write-env") {
      // Parsed here rather than with `flagValue`, which cannot tell "absent"
      // from "given something that looks like a flag". `--source --mint`
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
      // the path, mint through the sibling command, and look like it worked.
      // Or, worse, keep working as a way to name any executable on the runner.
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
      `  Try ${subcommandList(["deploy"])}.`,
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

/**
 * `planner <status|create|reset-password|drop> [--db-url <url>]`
 *
 * Operator-side lifecycle of the `migration_planner` role. See
 * `planner/commands.ts` for the commands themselves and for why there is no
 * `retrieve`. Interactive by design (create and reset confirm before writing
 * to production), so unlike the `deploy` group it talks through clack and is
 * fine to run as plain `pnpm devtools planner …`.
 */
async function runPlannerCommand(rest: string[]): Promise<void> {
  const [sub] = positionals(rest);
  const options = { dbUrl: flagValue(rest, "--db-url") ?? undefined };

  if (sub === "status") {
    await runPlannerStatus(options);
    return;
  }
  if (sub === "create") {
    await runPlannerCreate(options);
    return;
  }
  if (sub === "reset-password") {
    await runPlannerResetPassword(options);
    return;
  }
  if (sub === "drop") {
    await runPlannerDrop(options);
    return;
  }

  log.error(
    sub
      ? `devtools planner: unknown subcommand "${sub}". Try ${subcommandList(["planner"])}.`
      : `devtools planner: which of ${subcommandList(["planner"])}?`,
  );
  process.exitCode = 1;
}

/**
 * `signing-key <generate|import|status> --target <staging|production>`
 *
 * Operator-side like `planner`, and for the same reasons: prompts, env-file
 * writes, and SUPABASE_ACCESS_TOKEN, the apply-tier credential no unattended
 * job outside production-apply may hold. The deploy pipeline only READS the
 * key (`deploy mint-token`); everything that creates or registers it is a
 * human's move. See `signing-key/commands.ts`.
 */
async function runSigningKeyCommand(rest: string[]): Promise<void> {
  const [sub] = positionals(rest);
  const options = { target: flagValue(rest, "--target") ?? undefined };

  if (sub === "generate") {
    await runSigningKeyGenerate(options);
    return;
  }
  if (sub === "import") {
    await runSigningKeyImport(options);
    return;
  }
  if (sub === "status") {
    await runSigningKeyStatus(options);
    return;
  }

  log.error(
    sub
      ? `devtools signing-key: unknown subcommand "${sub}". Try ${subcommandList(["signing-key"])}.`
      : `devtools signing-key: which of ${subcommandList(["signing-key"])}?`,
  );
  process.exitCode = 1;
}

// ── Docs ─────────────────────────────────────────────────────────────────────

/**
 * `docs index [--force]`, the documentation search index.
 *
 * One subcommand today, and a group rather than a top-level `docs-index`
 * because the artifact it reads has more than one thing worth doing to it
 * (a `--check` that reports drift is the obvious next one).
 */
async function runDocsCommand(rest: string[]): Promise<void> {
  const [sub] = positionals(rest);

  if (!sub || !subcommandNames(["docs"]).includes(sub)) {
    log.error(
      sub
        ? `devtools docs: unknown subcommand "${sub}". Try ${subcommandList(["docs"])}.`
        : `devtools docs: which subcommand? Try ${subcommandList(["docs"])}.`,
    );
    process.exitCode = 1;
    return;
  }

  await runDocsIndex({ force: rest.includes("--force") });
}

// ── Dispatch ─────────────────────────────────────────────────────────────────

/** The outro line for a command that finished; `null` means one that failed. */
const DONE = "Done.";

/**
 * Routes an argv to a command, and reports what to print when it returns.
 *
 * The wizard calls THIS rather than the command functions, so a menu walk and
 * a typed command line take the identical path. `deploy` is not routed here.
 * It is dispatched before `intro()` in `main()`, for the reason
 * `runDeployCommand`'s header gives.
 *
 * Returns the `outro()` line, or `null` where the failure has already been
 * explained and a cheerful "Done." would contradict it.
 */
async function dispatch(argv: string[]): Promise<string | null> {
  const [first, ...rest] = argv;
  if (!first) return DONE;

  if (first === "setup") {
    await runSetup();
    return DONE;
  }

  // Reached only from the wizard. A typed `run` or `bw` is handled in
  // `main()` before `intro()`. Both exit with their child's status, so
  // neither returns and `outro()` is never reached. That is right: by the
  // time a menu walk gets here the banner is already on screen, above the
  // menu it introduced, rather than wedged between this CLI and turbo's
  // output.
  if (first === "run") return runTask(rest);
  if (first === "bw") return runBw(rest);

  if (first === "oauth") {
    await runOAuthSetup(flagValue(rest, "--base-url"));
    return 'All done! You\'re ready to "Sign in with DevDogs".';
  }

  if (first === "airtable") {
    await runAirtableCommand(rest);
    return DONE;
  }

  if (first === "docs") {
    await runDocsCommand(rest);
    return DONE;
  }

  if (first === "images") {
    // `connect` is passed rather than called: only event graphics need a
    // database, and `images page/*` must not demand a running stack to draw
    // pictures that come entirely out of this repo.
    await runImages(rest, { connect });
    return DONE;
  }

  if (first === "qr") {
    await runQr(rest);
    return DONE;
  }

  if (first === "env") {
    await runEnvCommand(rest);
    return DONE;
  }

  if (first === "planner") {
    await runPlannerCommand(rest);
    return DONE;
  }

  if (first === "signing-key") {
    await runSigningKeyCommand(rest);
    return DONE;
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
    return null;
  }

  if (!isStackCommand(first) && !isDoctorCommand(first)) {
    log.error(`Unknown command: ${first}`);
    // The top level only. The command is unknown, so there is no level below
    // it to describe, and reprinting the whole tree here is what made the old
    // help unreadable in the first place.
    log.message(renderHelp());
    process.exitCode = 1;
    return null;
  }

  if (isStackCommand(first)) {
    await runStack(first, parseTarget(rest));
    return DONE;
  }

  const instance = await connect();
  if (!instance) {
    process.exitCode = 1;
    return null;
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

  return DONE;
}

// ── Entry ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  // ⚠️ BEFORE the `--help` check, unlike everything else here. `bw` is a
  // passthrough, so `pnpm devtools bw --help` is a request for Bitwarden's
  // help, not for ours. Answering it with our own would be this CLI talking
  // over a tool it promised to get out of the way of.
  if (argv[0] === "bw") {
    await runBw(argv.slice(1));
    return;
  }

  // `helpPath` so that `env pull --help` answers about `env pull` rather than
  // reprinting the top level, which is the whole point of the split.
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(renderHelp(helpPath(argv)));
    return;
  }

  // ⚠️ BEFORE `intro()`, and this ordering is load-bearing rather than tidy.
  // `intro` writes to STDOUT, and `deploy secrets-file` / `deploy mint-token`
  // have a stdout that GitHub and this CLI respectively PARSE. See the header
  // on `runDeployCommand`. It returns without an `outro()` for the same
  // reason.
  if (argv[0] === "deploy") {
    await runDeployCommand(argv.slice(1));
    return;
  }

  // Also before `intro()`, for the neighbouring reason: this one hands stdout
  // to turbo, and through it to a Next dev server or a Flutter run that owns
  // the terminal until Ctrl-C. A banner above that output would be this CLI
  // announcing itself over somebody else's, and the `outro()` below would
  // print "Done." after a dev server was interrupted. `runTask` exits with
  // turbo's own status and never comes back.
  if (argv[0] === "run") {
    await runTask(argv.slice(1));
    return;
  }

  intro("DevDogs devtools");

  // The wizard builds an argv and hands it back to `dispatch`. See `menu.ts`.
  const closing =
    argv.length === 0 ? await runMenu(dispatch) : await dispatch(argv);

  if (closing) outro(closing);
}

main().catch((err: unknown) => {
  log.error(errorMessage(err));
  process.exit(1);
});
