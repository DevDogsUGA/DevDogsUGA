/**
 * `pnpm devtools run <task>`: which apps a root pnpm task runs against.
 *
 * `pnpm dev` used to start every app in the workspace at once: two Next dev
 * servers on two ports and a Flutter run, when almost nobody is working on
 * more than one. pnpm's own `--filter` has always made scoping possible, so
 * the capability was there. The DEFAULT was wrong, and a default you have to
 * know a flag to escape is one most contributors never escape.
 *
 * So every root package script routes through here. With a TTY and no
 * explicit filter it asks; without either it is a passthrough that costs one
 * or two process spawns (one to build dependencies first, for tasks that need
 * that — see `NEEDS_DEPS_BUILT` below — then one to run the task itself).
 *
 * ## Why this lives in devtools now
 *
 * It began here, moved out to `scripts/pick.mjs` as plain Node, and has come
 * back. The move out rested on two grounds, and re-checking them on 2026-08-27
 * found one of them false:
 *
 *   * "CI pays for it." It does not. No workflow invokes the root task
 *     aliases: `ci.yaml` and `deploy.yaml` both call `pnpm -r …`/`pnpm --filter
 *     …` directly, which never reaches this file. Only a person at a terminal
 *     pays it, and there it buys the question this exists to ask. The `CI`
 *     guard in `shouldAsk` stays as insurance against a runner that one day
 *     does type `pnpm build`.
 *   * "It must not need a build." This one holds, and is why the module stays
 *     careful. `pnpm build` routes through here, so anything on this path that
 *     had to be compiled first would be a cycle. It is safe because devtools
 *     runs from source under `--conditions=devdogs-source`, and because the
 *     one workspace dependency with no source condition (`@devdogsuga/docs`,
 *     which is `dist`-only) is reached through a lazy `await import` in
 *     `docs/index-pages.ts` and never loads on this path. ⚠️ A top-level
 *     `import` of `@devdogsuga/docs` anywhere in the eager graph would
 *     deadlock `pnpm build` on itself.
 *
 * ## Turbo's `^build` ordering, in pnpm terms
 *
 * Turbo's task graph guaranteed that a package's workspace dependencies were
 * built before the task ran against it — `dependsOn: ["^build"]` in the old
 * `turbo.json`, for every task in `NEEDS_DEPS_BUILT` below. pnpm has no single
 * flag that means the same thing, but it has the two pieces that compose into
 * it: `<pkg>^...` selects only the direct and indirect DEPENDENCIES of a
 * package (excluding the package itself), and plain recursive `pnpm -r` runs
 * scripts in dependency order (a package's own dependencies always run before
 * it). So building the deps-of set with `-r --filter '<pkg>^...' run build`
 * and then running the real task against the package itself reproduces
 * turbo's ordering with two spawns instead of turbo's one.
 *
 * `@devdogsuga/email` is the one package that needs its OWN build before its
 * OWN typecheck/test, not just its dependencies' — its build step generates
 * gitignored `src/generated/templates.ts`. That case never runs through this
 * picker (it lists `apps/*`, not `packages/*`; see `appsWith` below), but
 * matters for anyone reasoning about the workspace-wide passthrough path
 * (see `passthroughApps` and `allAppNames`), which builds the union of every
 * app's dependencies — email included, since some app depends on it —
 * before the target task, deliberately stopping short of a bare `pnpm -r run
 * build`: that would also run every APP's own build script, which a
 * typecheck/lint/test/dev run has no business doing (see `passthroughApps`'s
 * doc comment for why that is more than just wasted work).
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { cancel, confirm, isCancel, multiselect } from "@clack/prompts";
import { PROJECT_ROOT } from "../environment.js";

/**
 * Where the last answer per task is kept.
 *
 * Under `node_modules/.cache` rather than a dotfile at the root: it is a
 * convenience, not configuration, and losing it to a reinstall costs one extra
 * keystroke. Putting it there also means no new `.gitignore` entry and no new
 * file in the listing every contributor sees.
 */
const MEMORY = join(
  PROJECT_ROOT,
  "node_modules",
  ".cache",
  "devdogs",
  "tasks.json",
);

/**
 * pnpm's own ways of naming packages, plus `--scope` for backward
 * compatibility with anyone who still types the turbo-era flag out of habit.
 * Any of them means "already decided" for `shouldAsk`; `--scope`'s value is
 * translated into a `--filter` when a command actually gets built, since pnpm
 * itself has no `--scope` flag.
 */
const FILTERS = ["--filter", "-F", "--scope"];

/**
 * Tasks whose turbo definition depended on `^build` — the packages a target
 * depends on must be built first. Everything else forwarded through `run`
 * (`generate-types`, and any package script not in this list) needs no
 * dependency build: turbo's `generate-types` declared no `dependsOn` at all,
 * and nothing else is routed through the root aliases this picker serves.
 */
const NEEDS_DEPS_BUILT = new Set([
  "build",
  "dev",
  "typecheck",
  "lint",
  "lint:fix",
  "test",
  "test:coverage",
]);

interface App {
  name: string;
  script: string;
}

// ── Passthrough ──────────────────────────────────────────────────────────────

/**
 * Runs one `pnpm` invocation to completion, reporting its own exit the way
 * `passthroughApps` needs to: a truthy return means "keep going", `never` on
 * anything that ends the process (a signal, or a non-zero status treated as
 * final).
 *
 * `pnpm` resolves from the workspace root's `node_modules/.bin`, which is
 * already on PATH. Signals and exit codes pass straight through, so a Ctrl-C
 * in a dev server behaves exactly as it did before this existed: when the
 * child dies to a signal rather than exiting with a code, this process
 * re-raises that same signal against itself instead of collapsing it to a
 * generic exit code, which is what lets a shell watching this process see a
 * conventional signal death rather than a failure.
 *
 * ⚠️ `cwd` is explicit, and must be. Reached through
 * `pnpm --filter @devdogsuga/devtools run cli`, this process starts in
 * `packages/devtools`, and a `pnpm -r`/`--filter` invoked there would scope
 * itself relative to that one package rather than the workspace root.
 */
function runOne(
  args: string[],
  extraEnv: NodeJS.ProcessEnv | undefined,
  { final }: { final: boolean },
): boolean {
  const result = spawnSync("pnpm", args, {
    cwd: PROJECT_ROOT,
    stdio: "inherit",
    // Guards the one recursion that would matter: a bare, filter-less `pnpm
    // -r` never re-enters the root package's own scripts (pnpm excludes the
    // workspace root from an unfiltered recursive run by default), but an
    // explicit `--filter` naming the root package — or a `!`-exclusion or
    // `[since]` selector, both of which DO match the root even though a bare
    // `-r` does not — would. `DEVDOGS_PICK=0` is the same recursion guard
    // turbo's spawn used: it means "already decided", so a root script that
    // re-entered `pnpm devtools run …` would pass straight through instead of
    // asking again.
    env: { ...process.env, ...extraEnv, DEVDOGS_PICK: "0" },
  });
  if (result.signal) {
    // Restore the default disposition first: any SIGINT/SIGTERM listener
    // this process itself registered (`@clack/prompts` installs one while a
    // prompt is open) would otherwise run instead of the OS just ending the
    // process, which is what re-raising is supposed to produce.
    process.removeAllListeners(result.signal);
    process.kill(process.pid, result.signal);
    // Default disposition means the OS ends this process as part of that
    // call, so nothing below ever runs long enough to matter.
    for (;;) {
      /* unreachable */
    }
  }
  const status = result.status ?? 1;
  if (status !== 0 || final) {
    process.exit(status);
  }
  return true;
}

/**
 * Runs a sequence of `pnpm` invocations — typically "build the dependencies",
 * then "run the actual task" — stopping (and exiting non-zero) at the first
 * one that fails, and exiting with the LAST one's status otherwise. This is
 * what stands in for turbo's single-process task graph: turbo built
 * dependencies and ran the target task inside one invocation, so a dependency
 * build failure and a task failure looked identical from the outside (a
 * failed `turbo run`); this reproduces that from the outside by never
 * reaching the second spawn if the first one failed.
 *
 * Never returns: every branch inside `runOne` either exits or re-raises a
 * signal.
 */
function passthrough(
  commands: string[][],
  extraEnv?: NodeJS.ProcessEnv,
): never {
  commands.forEach((args, index) => {
    runOne(args, extraEnv, { final: index === commands.length - 1 });
  });
  // Unreachable: `runOne` above always exits on the final command (`final:
  // true` forces it even on success), and exits early on any earlier
  // failure. This satisfies the `never` return type without a bare `throw`.
  process.exit(1);
}

/**
 * Whether to ask at all.
 *
 * Every one of these is a case where a prompt is either impossible or wrong:
 *
 *   * `CI`, set by GitHub Actions and every other runner. No workflow reaches
 *     this today (see the header), but a workflow that blocked on a
 *     multiselect would hang until its timeout with no output saying why, and
 *     that failure is bad enough to keep guarding against.
 *   * No TTY: a pipe, a `pnpm` invoked by a script, an editor task runner.
 *     Nobody is there to answer. Every other picker in this repo checks the
 *     same thing.
 *   * An explicit filter. The caller has already said which packages, and
 *     asking again would be asking them to repeat themselves.
 *   * `DEVDOGS_PICK=0`, the escape hatch and the recursion guard above.
 */
export function shouldAsk(args: string[]): boolean {
  if (process.env.CI) return false;
  if (process.env.DEVDOGS_PICK === "0") return false;
  if (!process.stdin.isTTY) return false;
  return !args.some(
    (arg) =>
      FILTERS.includes(arg) || FILTERS.some((f) => arg.startsWith(`${f}=`)),
  );
}

/**
 * Pulls every `--filter`/`-F`/`--scope` value out of `args`, returning the
 * package patterns named and the remaining args with those flags removed.
 *
 * `--scope` is folded into the same bucket as `--filter` here: pnpm has no
 * `--scope` flag of its own, so a caller who still types the turbo-era name
 * gets it translated into a real `--filter` value rather than passed through
 * to a `pnpm` invocation that would reject it outright.
 *
 * Exported for the same reason `parseTierArg` is: pure, no `process.exit`, so
 * it is unit-testable without going through `passthrough`.
 */
export function extractFilters(args: readonly string[]): {
  filters: string[];
  rest: string[];
} {
  const filters: string[] = [];
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    const eqFlag = FILTERS.find((f) => arg.startsWith(`${f}=`));
    if (eqFlag) {
      filters.push(arg.slice(eqFlag.length + 1));
      continue;
    }
    if (FILTERS.includes(arg)) {
      const value = args[i + 1];
      if (value !== undefined) {
        filters.push(value);
        i++;
        continue;
      }
    }
    rest.push(arg);
  }
  return { filters, rest };
}

/**
 * Every `apps/*` package name, regardless of whether it defines the task in
 * question — unlike `appsWith`, which is a picker concern (only offer apps
 * that actually have this script). This exists for exactly one thing: naming
 * "every dependency any app has" without hand-listing packages, since apps
 * are the only packages in this workspace nothing else depends on (every
 * `packages/*`/`docs` package is reachable from at least one app's
 * dependency graph, and no app depends on another app).
 */
function allAppNames(): string[] {
  const dir = join(PROJECT_ROOT, "apps");
  if (!existsSync(dir)) return [];

  const names: string[] = [];
  for (const entry of readdirSync(dir)) {
    const manifest = join(dir, entry, "package.json");
    if (!existsSync(manifest)) continue;
    try {
      const pkg = JSON.parse(readFileSync(manifest, "utf8")) as {
        name?: string;
      };
      if (pkg.name) names.push(pkg.name);
    } catch {
      // Same as `appsWith`: an unparsable manifest is one we cannot use.
    }
  }
  return names;
}

/**
 * Builds the `pnpm run <task>` invocation(s) for a set of package filters (or
 * none, for the whole workspace) and runs them via `passthrough`.
 *
 * Two spawns for a task in `NEEDS_DEPS_BUILT`: one that builds only the
 * dependencies of the target packages, then one that runs the real task
 * against the target packages themselves. A task outside `NEEDS_DEPS_BUILT`
 * skips straight to the second spawn.
 *
 * The first spawn's filter set matters more than it looks: it must build
 * every dependency the target packages need, and NOTHING ELSE — never an
 * app's own `build` script, since turbo's `^build` never ran one either
 * (typechecking `platform` built platform's DEPENDENCIES, then ran
 * `platform`'s `typecheck` script; it never ran `platform`'s own `build`).
 * Getting this wrong is not just wasted work: an app's `build` script can
 * need things a `typecheck`/`lint`/`test` run has no reason to have (a
 * database, a chosen deploy tier, a Flutter SDK on PATH), so running one
 * unasked can fail outright.
 *
 *   * Filtered (`filters` non-empty): `<pkg>^...` per filter — pnpm's
 *     deps-of selector, excluding the package itself.
 *   * Whole workspace: the union of `<app>^...` over every app in the
 *     workspace (`allAppNames()`), NOT a bare `pnpm -r run build`. A bare
 *     recursive build would build every package with a `build` script,
 *     apps included, for exactly the reason above. Every non-app package in
 *     this workspace is reachable from at least one app's dependency graph
 *     (verified against every current `apps/*` package, not assumed), so
 *     this covers the same ground a bare `-r` would minus the apps
 *     themselves.
 *
 * `dev` is the one persistent task and runs with `--parallel`: pnpm's
 * ordinary recursive mode runs one package at a time in dependency order,
 * which is wrong for two dev servers that are each supposed to keep running
 * — `--parallel` "completely disregard[s] concurrency and topological
 * sorting, running a given script immediately in all matching packages with
 * prefixed streaming output" (pnpm's own words for the flag), which is
 * exactly the live, interleaved multi-app output turbo's `dev` gave. Every
 * other task keeps pnpm's default topological/serial recursion, which is a
 * real difference from turbo: turbo ran independent tasks (lint, typecheck,
 * test across several apps) concurrently up to its own concurrency limit,
 * while this runs them one package at a time. Slower on a multi-app
 * selection, never wrong.
 *
 * `build` with no filter (the whole workspace) is the one case that skips
 * the separate dependency spawn even though it is in `NEEDS_DEPS_BUILT`: a
 * bare `pnpm -r run build` already builds every package — apps included, and
 * rightly so, since the task itself IS `build` — in dependency order in one
 * pass, so a preceding dependency-only spawn would just redo part of it. A
 * FILTERED build still needs the pre-step — naming a package by itself,
 * with no `^...`, selects only that package, not what it depends on.
 */
function passthroughApps(
  task: string,
  filters: string[],
  rest: string[],
  extraEnv?: NodeJS.ProcessEnv,
): never {
  const commands: string[][] = [];

  const needsDepsPreStep =
    NEEDS_DEPS_BUILT.has(task) && (task !== "build" || filters.length > 0);
  if (needsDepsPreStep) {
    const depsOfTargets = filters.length > 0 ? filters : allAppNames();
    const depsFilters = depsOfTargets.flatMap((f) => ["--filter", `${f}^...`]);
    commands.push(["-r", "--if-present", ...depsFilters, "run", "build"]);
  }

  const ownFilters = filters.flatMap((f) => ["--filter", f]);
  const parallel = task === "dev" ? ["--parallel"] : [];
  commands.push([
    "-r",
    "--if-present",
    ...parallel,
    ...ownFilters,
    "run",
    task,
    ...rest,
  ]);

  passthrough(commands, extraEnv);
}

// ── Tier ─────────────────────────────────────────────────────────────────────

/** The tiers a loaded env can select. `preflight` is not a deploy environment
 * (see `@devdogsuga/env`'s target table) and is refused here for the same
 * reason `loadEnvironment` itself would refuse it. */
const RUN_TIERS = new Set(["development", "staging", "production"]);

export interface TierArgResult {
  /** The validated tier, or absent when `--tier` was not passed. */
  tier?: string;
  /** `args` with `--tier` and its value removed, so pnpm never sees them. */
  rest: string[];
  /** Set instead of `tier` when parsing failed; `rest` is unchanged on error. */
  error?: string;
}

/**
 * Parses and strips `--tier <value>` from pnpm-bound args, mirroring the
 * `--all` strip above.
 *
 * Pure on purpose — no `process.exit` — so this is unit-testable without
 * going through `passthrough`, which every other path in this file ends at
 * and which a test cannot observe return from. `runTask` is the one caller,
 * and it is the one that turns `error` into an exit.
 */
export function parseTierArg(args: readonly string[]): TierArgResult {
  const idx = args.indexOf("--tier");
  if (idx === -1) return { rest: [...args] };

  const value = args[idx + 1];
  if (!value || value.startsWith("-")) {
    return { rest: [...args], error: "devtools run: --tier requires a value." };
  }
  if (!RUN_TIERS.has(value)) {
    return {
      rest: [...args],
      error:
        `devtools run: unknown tier "${value}". ` +
        "Expected: development, staging, production.",
    };
  }

  return {
    tier: value,
    rest: [...args.slice(0, idx), ...args.slice(idx + 2)],
  };
}

// ── The apps ─────────────────────────────────────────────────────────────────

/**
 * The apps that actually define this task, by package name.
 *
 * `apps/*` only. Packages are libraries an app pulls in, and a filtered
 * `pnpm -r --filter '<app>^...' run build` already builds those first (see
 * `passthroughApps` above), so listing all twelve would ask about things the
 * answer does not change. Reading each `package.json` rather than shelling
 * out to a dry-run equivalent, which costs about a second before the first
 * question.
 */
function appsWith(task: string): App[] {
  const dir = join(PROJECT_ROOT, "apps");
  if (!existsSync(dir)) return [];

  const found: App[] = [];
  for (const entry of readdirSync(dir)) {
    const manifest = join(dir, entry, "package.json");
    if (!existsSync(manifest)) continue;
    try {
      const pkg = JSON.parse(readFileSync(manifest, "utf8")) as {
        name?: string;
        scripts?: Record<string, string | undefined>;
      };
      const script = pkg.scripts?.[task];
      if (pkg.name && script) found.push({ name: pkg.name, script });
    } catch {
      // A manifest we cannot parse is one we cannot offer. pnpm will report
      // it far better than a picker could.
    }
  }
  return found;
}

// ── Memory ───────────────────────────────────────────────────────────────────

function remembered(task: string): string[] {
  try {
    const all = JSON.parse(readFileSync(MEMORY, "utf8")) as Record<
      string,
      string[] | undefined
    >;
    return all[task] ?? [];
  } catch {
    return [];
  }
}

function remember(task: string, apps: string[]): void {
  try {
    let all: Record<string, string[]> = {};
    try {
      all = JSON.parse(readFileSync(MEMORY, "utf8")) as Record<
        string,
        string[]
      >;
    } catch {
      // First run, or a file from an older shape. Either way, start clean.
    }
    all[task] = apps;
    mkdirSync(dirname(MEMORY), { recursive: true });
    writeFileSync(MEMORY, `${JSON.stringify(all, null, 2)}\n`);
  } catch {
    // Remembering is a convenience. Failing to write it must never fail the
    // command the contributor actually asked for.
  }
}

// ── Entry ────────────────────────────────────────────────────────────────────

/**
 * Runs one root task, asking which apps first where that makes sense.
 *
 * Never returns: every path ends in `passthrough`, which exits with the
 * underlying `pnpm` invocation's own status. That is why `cli.ts` dispatches
 * this before `intro()`. There is no `outro()` to reach, and a banner would
 * land on the stream a dev server is about to take over.
 */
export async function runTask(argv: string[]): Promise<never> {
  const [task, ...args] = argv;

  if (!task) {
    console.error("usage: pnpm devtools run <task> [pnpm args…]");
    process.exit(1);
  }

  // `--all` is this command's own flag, not pnpm's: it means "no question,
  // every package", which is what the root scripts did before this existed.
  // Removed from the argv so pnpm never sees a flag it does not know.
  const all = args.includes("--all");
  const withoutAll = args.filter((arg) => arg !== "--all");

  const tierArg = parseTierArg(withoutAll);
  if (tierArg.error) {
    console.error(tierArg.error);
    process.exit(1);
  }
  const { tier, rest } = tierArg;

  // No `--yes` here, deliberately: `run` is a bare pnpm passthrough with no
  // confirmation flag of its own to spare, unlike `cron run`/`workflows run`.
  // A non-interactive caller that wants production has no way to say so, and
  // that is the point — the same exposure those two gate behind `--yes` gets
  // gated behind a terminal existing at all.
  if (tier === "production") {
    if (!process.stdin.isTTY) {
      console.error(
        "devtools run: --tier production needs a terminal to confirm — " +
          "nothing ran.",
      );
      process.exit(1);
    }
    const approved = await confirm({
      message:
        `Run \`${task}\` against production? This loads .env.production's ` +
        "credentials into the child process.",
      initialValue: false,
    });
    if (isCancel(approved) || !approved) {
      cancel("Nothing ran.");
      process.exit(0);
    }
  }

  let tierEnv: NodeJS.ProcessEnv | undefined;
  if (tier) {
    // Dynamic import, not a top-level one: this module is on the `pnpm build`
    // hot path (see the header), and a bare `pnpm build` with no `--tier`
    // must never load `@devdogsuga/env/load` or drag dotenvx into the graph.
    const { loadEnvironment, MissingEnvFileError } =
      await import("@devdogsuga/env/load");
    try {
      // override: true because THIS process runs under `with-env`
      // (development), so process.env already holds development's values.
      // Passing the full loaded env — not just DEPLOY_ENV — to the child
      // matters because a grandchild `with-env` (started by the app's own
      // script) resolves variables first-file-wins from ITS OWN process.env:
      // without the full map, that env would still carry devtools' inherited
      // development values, which would beat `.env.<tier>` for anything
      // `.env.<tier>` does not also redeclare.
      const loaded = await loadEnvironment(tier, { override: true });
      tierEnv = { ...loaded.env, DEPLOY_ENV: tier };
    } catch (err) {
      if (err instanceof MissingEnvFileError) {
        console.error(`devtools run: ${err.message}`);
        process.exit(1);
      }
      throw err;
    }
  }

  // `shouldAsk` is false whenever `rest` already carries an explicit filter,
  // so extracting filters here (rather than unconditionally) would be
  // redundant with it in every case that matters; `all` is the one case
  // `shouldAsk` cannot see for itself. Either way, `rest` may still carry an
  // explicit `--filter`/`-F`/`--scope` that needs pulling out before it is
  // forwarded — as a trailing arg after `run <task>`, pnpm hands it straight
  // to the underlying script rather than treating it as its own flag.
  if (all || !shouldAsk(rest)) {
    const { filters, rest: cleanRest } = extractFilters(rest);
    passthroughApps(task, filters, cleanRest, tierEnv);
  }

  const apps = appsWith(task);

  // Nothing to choose between: one app, or none that define this task (pnpm
  // will say so better than a picker with a single option would).
  if (apps.length < 2) passthroughApps(task, [], rest, tierEnv);

  const previous = remembered(task);

  const chosen = await multiselect({
    // The `--all` escape is named in the message rather than offered as an
    // option. An "everything" entry used to sit alongside the apps; clack's
    // toggle-all `a` replaces most of what it was for, but not all of it. `a`
    // selects every app in THIS list, which is `apps/*`; `--all` passes no
    // filter at all, which is every package in the workspace.
    //
    // For `build` those nearly coincide, since filtering to an app pulls its
    // dependencies in through the deps-of build step. For `test`, `lint` and
    // `typecheck` they do not: those tasks only run against the apps
    // themselves, not their dependencies, so filtering to the four apps runs
    // four test tasks while an unfiltered run covers every package. Selecting
    // every app and expecting a workspace-wide test run would quietly skip
    // every suite in `packages/*`.
    message: `\`${task}\` — which apps? (a selects all; --all runs every package)`,
    options: apps.map((app) => ({
      value: app.name,
      label: app.name,
      // The actual command, so the choice is made against what runs, not a name.
      hint: app.script.length > 58 ? `${app.script.slice(0, 57)}…` : app.script,
    })),
    // Only what was picked last time, and only names still on offer, which
    // also drops the retired "everything" entry from an older cache rather
    // than preselecting a value nothing would match. Nothing is preselected on
    // a first run, so with `required` the first answer is a real choice rather
    // than an Enter through a default.
    initialValues: previous.filter((name) =>
      apps.some((app) => app.name === name),
    ),
    required: true,
  });

  if (isCancel(chosen)) {
    cancel("Nothing ran.");
    process.exit(0);
  }

  remember(task, chosen);

  passthroughApps(task, chosen, rest, tierEnv);
}
