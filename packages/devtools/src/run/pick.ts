/**
 * `pnpm devtools run <task>` — which apps a root turbo task runs against.
 *
 * `pnpm dev` used to start every app in the workspace at once: two Next dev
 * servers on two ports and a Flutter run, when almost nobody is working on
 * more than one. Turborepo has always had `--filter`, so the capability was
 * there — it was the DEFAULT that was wrong, and a default you have to know a
 * flag to escape is one most contributors never escape.
 *
 * So every root turbo script routes through here. With a TTY and no explicit
 * filter it asks; with either of those absent it is a passthrough that costs
 * one process spawn.
 *
 * ## Why this lives in devtools now
 *
 * It began here, moved out to `scripts/pick.mjs` as plain Node, and has come
 * back. The move out was justified on two grounds, and re-checking them on
 * 2026-08-27 found one of them false:
 *
 *   * **"CI pays for it."** It does not. No workflow invokes the root task
 *     aliases — `ci.yaml` and `deploy.yaml` both call `pnpm turbo run …`
 *     directly (`ci.yaml:69`, `:84`, `:183`, `:216`; `deploy.yaml:207`,
 *     `:601`), which never reaches this file. The cost was only ever paid by
 *     a person at a terminal, where it buys the question this exists to ask.
 *     The `CI` guard in `shouldAsk` stays anyway, as insurance against a
 *     runner that one day does type `pnpm build`.
 *   * **"It must not need a build."** This one holds, and is why the module
 *     stays careful. `pnpm build` routes through here, so anything on this
 *     path that had to be compiled first would be a cycle. It is safe because
 *     devtools runs from source under `--conditions=devdogs-source`, and
 *     because the one workspace dependency with no source condition —
 *     `@devdogsuga/docs`, which is `dist`-only — is reached through a lazy
 *     `await import` in `docs/index-pages.ts` and never loads on this path.
 *     ⚠️ A top-level `import` of `@devdogsuga/docs` anywhere in the eager
 *     graph would deadlock `pnpm build` on itself.
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
import { isCancel, cancel, multiselect } from "@clack/prompts";
import { PROJECT_ROOT } from "../environment.js";

/**
 * Where the last answer per task is kept.
 *
 * Under `node_modules/.cache` rather than a dotfile at the root: it is a
 * convenience, not configuration — losing it to a reinstall costs one extra
 * keystroke — and putting it there means no new `.gitignore` entry and no new
 * file in the listing every contributor sees.
 */
const MEMORY = join(
  PROJECT_ROOT,
  "node_modules",
  ".cache",
  "devdogs",
  "tasks.json",
);

/** Turbo's own ways of naming packages. Any of them means "already decided". */
const FILTERS = ["--filter", "-F", "--scope"];

interface App {
  name: string;
  script: string;
}

// ── Passthrough ──────────────────────────────────────────────────────────────

/**
 * Runs turbo with whatever it was given and exits.
 *
 * `turbo` resolves from the workspace root's `node_modules/.bin`, which pnpm
 * has already put on PATH. Signals and exit codes pass straight through, so a
 * Ctrl-C in a dev server behaves exactly as it did before this existed.
 *
 * ⚠️ `cwd` is explicit, and must be. Reached through
 * `pnpm --filter @devdogsuga/devtools run cli`, this process starts in
 * `packages/devtools`, and a turbo invoked there would scope itself to that
 * one package rather than the workspace.
 */
function passthrough(task: string, args: string[]): never {
  const result = spawnSync("turbo", ["run", task, ...args], {
    cwd: PROJECT_ROOT,
    stdio: "inherit",
    // Guards the one recursion that would matter: turbo does not run the root
    // package's scripts by default, but a `//#task` entry added later would
    // re-enter this file through the root alias. Seeing the marker, it would
    // pass straight through.
    env: { ...process.env, DEVDOGS_PICK: "0" },
  });
  process.exit(result.status ?? 1);
}

/**
 * Whether to ask at all.
 *
 * Every one of these is a case where a prompt is either impossible or wrong:
 *
 *   * `CI` — set by GitHub Actions and every other runner. No workflow reaches
 *     this today (see the header), but a workflow that blocked on a
 *     multiselect would hang until its timeout with no output saying why, and
 *     that failure is bad enough to keep guarding against.
 *   * no TTY — a pipe, a `turbo` invoked by a script, an editor task runner.
 *     Nobody is there to answer. Every other picker in this repo checks the
 *     same thing.
 *   * an explicit filter — the caller has already said which packages, and
 *     asking again would be asking them to repeat themselves.
 *   * `DEVDOGS_PICK=0` — the escape hatch, and the recursion guard above.
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

// ── The apps ─────────────────────────────────────────────────────────────────

/**
 * The apps that actually define this task, by package name.
 *
 * `apps/*` only. Packages are libraries an app pulls in, and turbo already
 * builds those through `^build` when it builds the app that needs them — so
 * listing all twelve would be asking a question about things the answer does
 * not change. Reading each `package.json` rather than shelling out to
 * `turbo run --dry=json`, which is authoritative but costs about a second
 * before the first question.
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
      // A manifest we cannot parse is one we cannot offer. Turbo will report
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
 * Runs one root turbo task, asking which apps first where that makes sense.
 *
 * Never returns: every path ends in `passthrough`, which exits with turbo's
 * own status. That is why `cli.ts` dispatches this before `intro()` — there is
 * no `outro()` to reach, and a banner would land on the stream a dev server is
 * about to take over.
 */
export async function runTask(argv: string[]): Promise<never> {
  const [task, ...args] = argv;

  if (!task) {
    console.error("usage: pnpm devtools run <task> [turbo args…]");
    process.exit(1);
  }

  // `--all` is this command's own flag, not turbo's: it means "no question,
  // every package", which is what the root scripts did before this existed.
  // Removed from the argv so turbo never sees a flag it does not know.
  const all = args.includes("--all");
  const rest = args.filter((arg) => arg !== "--all");

  if (all || !shouldAsk(rest)) passthrough(task, rest);

  const apps = appsWith(task);

  // Nothing to choose between: one app, or none that define this task (turbo
  // will say so better than a picker with a single option would).
  if (apps.length < 2) passthrough(task, rest);

  const previous = remembered(task);

  const chosen = await multiselect({
    // The `--all` escape is named here rather than offered as an option.
    //
    // There used to be an "everything" entry alongside the apps, and `a` —
    // clack's toggle-all — replaces most of what it was for. Not all of it,
    // though, and the difference is worth the half-line it costs to say:
    // `a` selects every app in THIS list, which is `apps/*`. `--all` passes
    // no filter at all, which is every package in the workspace.
    //
    // For `build` those nearly coincide, since filtering to an app pulls its
    // dependencies in through `^build`. For `test`, `lint` and `typecheck`
    // they do not, and not by a little: those tasks declare `dependsOn:
    // ["^build"]`, not `^test`, so filtering to the four apps runs four test
    // tasks while an unfiltered run covers ten packages. Selecting every app
    // and expecting a workspace-wide test run would quietly skip every suite
    // in `packages/*`.
    message: `\`${task}\` — which apps? (a selects all; --all runs every package)`,
    options: apps.map((app) => ({
      value: app.name,
      label: app.name,
      // The actual command, so the choice is made against what will run
      // rather than against a name.
      hint: app.script.length > 58 ? `${app.script.slice(0, 57)}…` : app.script,
    })),
    // Only what was picked last time, and only names still on offer — which
    // also quietly drops the retired "everything" entry from an older cache
    // rather than preselecting a value nothing would match. Nothing is
    // preselected on a first run, so with `required` the first answer is a
    // real choice rather than an Enter through a preselected default.
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

  passthrough(task, [...chosen.map((name) => `--filter=${name}`), ...rest]);
}
