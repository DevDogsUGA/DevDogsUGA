/**
 * Single env-loading helper for every workspace script:
 *
 *   with-env <command> [args...]
 *   with-env -c '<shell command>'
 *
 * Loads the environment `DEPLOY_ENV` selects, where unset means development
 * means the root `.env`. In development only, it also loads the
 * `.env.generated` overlay when the local Supabase stack is actually listening
 * (see `load.ts` for the probe table). Installed as a bin, so it inherits the
 * calling package's directory and its node_modules/.bin, with no chdir or PATH
 * fixup.
 *
 * The files it loaded are printed to stderr on every run. That is a design
 * requirement, not chattiness: the probe silently decides between the hosted
 * project and a running local container, and which database a command just
 * touched must never be a guess.
 *
 * Use -c when the command needs a value *from* the env files. A $VAR in the
 * script is expanded by pnpm's shell before this helper loads anything, so it
 * would resolve against the ambient environment; quoting it and passing it to
 * -c defers expansion until after the env is loaded. -c runs the string
 * through @yarnpkg/shell, the same JS shell pnpm's shellEmulator uses, so it
 * stays cross-platform.
 *
 * Neither mode spawns a platform shell, so this works on Windows and POSIX.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { UnknownEnvironmentError } from "./targets.js";
import {
  applyWranglerLocalDatabaseAlias,
  loadEnvironment,
  MissingEnvFileError,
} from "./load.js";
import { availableTiers, resolveSessionTier } from "./session.js";

// ALMOST NOTHING ELSE IS IMPORTED AT THE TOP LEVEL, deliberately.
//
// This wrapper runs in front of roughly fifty package scripts, so every import
// here is paid by every one of them, including the ones that never reach the
// code needing it. Measured on 2026-08-14, `with-env node -e ""` took 560ms
// against 17ms for bare node, and the breakdown was mostly imports the common
// path never used:
//
//   @yarnpkg/shell + @yarnpkg/fslib   +50ms   only `-c` runs a shell
//   @dotenvx/dotenvx (Node API)      +127ms   only some paths load in-process
//   tsx register                      +24ms
//
// So all three stay dynamically imported where they are used. commander is the
// one exception, measured before admitting it: its import costs ~6ms, and on
// 2026-08-15 this rewrite timed at ~210-230ms per `with-env node -e ""`
// against ~200ms for the old hand-rolled parser. commander, the selection
// modules, and the port probe together cost ~10-30ms, cheap enough to keep
// the parsing declarative. Anything heavier gets lazy-imported: a top-level
// import added here for tidiness costs every script in the repository on
// every run.
//
// `./session.js` joins that top-level group for the same reason: it imports
// only `./targets.js` and `./load.js`, both already paid for above, and
// defers `node:fs`/`node:path` inside `availableTiers()` exactly like this
// file's own `findRoot()` does. It adds no new heavy dependency to the
// common path.

// Walk up for the workspace marker rather than assuming a fixed depth, so the
// helper keeps working if this package is ever moved.
function findRoot(from: string): string {
  for (let dir = from; ;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) {
      console.error("with-env: could not locate the monorepo root.");
      process.exit(1);
    }
    dir = parent;
  }
}

const root = findRoot(resolve(dirname(fileURLToPath(import.meta.url)), ".."));

// `.enablePositionalOptions()` + `.passThroughOptions()` are what make
// commander safe here: the first positional ends option parsing, so in
// `with-env next dev --port 3001` the `--port` belongs to next, not to us.
// Without them commander would eat (or reject) the wrapped command's flags.
//
// There used to be a `--local` option here. It selected `.env.generated`
// before the port probe existed, spent one release as a deprecated no-op, and
// was removed together with the `:local` script variants once the probe alone
// decided local vs hosted. It is NOT kept as a hidden no-op: an old script or
// muscle memory still passing the flag should fail loudly as an unknown
// option, because a flag that looks like it selects the database while
// actually deciding nothing is exactly the silent lie the probe was built to
// remove.
const program = new Command("with-env")
  .enablePositionalOptions()
  .passThroughOptions()
  .option("-c <script>", "run a shell script string with the env loaded")
  .option(
    "--tier <tier>",
    "deploy tier to load (development, staging, production); " +
      "overrides DEPLOY_ENV",
  )
  .argument("[command...]", "command to run with the env loaded")
  .configureOutput({
    // Re-prefix commander's `error:` lines so a rejected flag (e.g. the
    // removed --local) reads as with-env refusing it, not the wrapped command.
    writeErr: (str) =>
      process.stderr.write(str.replace(/^error:/, "with-env:")),
  });

program.parse();
const opts = program.opts<{ c?: string; tier?: string }>();
const args = program.args;

const usage =
  "with-env: usage: with-env <command> [args...]\n" +
  "                 with-env -c '<shell command>'";

const shellMode = opts.c !== undefined;
if (shellMode && args.length > 0) {
  console.error("with-env: -c takes a single quoted string\n" + usage);
  process.exit(1);
}
if (!shellMode && args.length === 0) {
  console.error(usage);
  process.exit(1);
}

// Running as a bin, the cwd is already the package whose script invoked us.
const cwd = process.cwd();

// Which tier to run under: `--tier` wins outright, then a non-empty
// `DEPLOY_ENV`, then (an ordinary contributor's machine, at most one tier
// file present) the sole tier — the ONE policy in `session.ts`, shared with
// the devtools launcher.
//
// ⚠️ NO `prompt` IS PASSED, EVER. `with-env` fronts turbo-parallel tasks and
// dev servers, none of which has anyone at a keyboard to answer a picker —
// `isTTY: false` plus an absent `prompt` means two-or-more tier files
// present with neither `--tier` nor `DEPLOY_ENV` set is ALWAYS an explicit
// refusal here, never a silent guess or a hang waiting on stdin.
//
// This is also what keeps `pnpm devtools` itself working: its launcher sets
// `DEPLOY_ENV` on every child task before spawning it, so each child
// resolves by `deployEnv` (case (b) in `resolveSessionTier`) and never
// reaches the ambiguity refusal above, even on a machine that has pulled
// down every tier's file.
const tierExists = (relPath: string) => existsSync(join(root, relPath));
const resolution = await resolveSessionTier({
  explicit: opts.tier,
  deployEnv: process.env.DEPLOY_ENV,
  available: await availableTiers(root, tierExists),
  isTTY: false,
});
if (!resolution.ok) {
  console.error(`with-env: ${resolution.reason}`);
  process.exit(1);
}

// Decide which files to load, and load them, in one call — selection is
// still separated from loading inside load.ts, but `with-env` no longer
// needs to see the seam. This always happens in-process, even on Windows
// where the *spawn* below still delegates. `root` was already resolved
// above (needed regardless, for the Windows -f paths further down), so it is
// passed through here rather than having loadEnvironment re-walk for
// pnpm-workspace.yaml a second time. The warnings and the loaded-files line
// are ours either way.
let env: Record<string, string>;
let envFiles: string[];
try {
  const loaded = await loadEnvironment(resolution.tier, undefined, {
    root,
  });
  for (const warning of loaded.warnings) {
    console.error(`with-env: ${warning}`);
  }
  // Required, never a guess: a running local container silently wins over the
  // hosted project, so every run says which files actually won.
  console.error(
    `with-env: loaded ${loaded.files.join(" + ")} (${loaded.environment})`,
  );
  envFiles = loaded.files;
  env = loaded.env;
} catch (err) {
  // A missing file is reported and survived, NOT refused.
  //
  // It used to exit(1), which is why `@devdogsuga/devtools` carried a second
  // entry point. `pnpm devtools` runs under this wrapper, and the commands that
  // run before there IS an environment could only reach the CLI by going around
  // it: `setup`, which creates `.env`, and the two checks CI runs on a clean
  // checkout. That made the wrapper, rather than the command, the thing that
  // decided whether an environment was needed.
  //
  // Now there is one door. A command that genuinely needs a variable still
  // fails, and fails naming the variable: @t3-oss validates the environment at
  // import time and says which key is missing, which is a better error than
  // this one could give. What is gone is the case where a command needing
  // nothing was refused for the absence of a file it would never have read.
  //
  // `UnknownEnvironmentError` is NOT downgraded with it. A missing file is an
  // absence; a `DEPLOY_ENV` naming an environment that does not exist is a
  // typo pointing at the wrong database, and running "as development" because
  // `production` was misspelled is the silent lie this package exists to
  // prevent.
  //
  // That typo is now largely caught earlier: `resolveSessionTier` above
  // already refuses an unrecognised `--tier` or `DEPLOY_ENV` before
  // `loadEnvironment` is ever called. This branch is kept as a backstop
  // regardless — `loadEnvironment` still resolves the tier itself and would
  // throw exactly this for any future caller that reaches it having skipped
  // resolution, and a backstop that silently rotted into dead code is worse
  // than one extra branch.
  if (err instanceof MissingEnvFileError) {
    console.error(`with-env: ${err.message}`);
    console.error("with-env: continuing with no env file loaded.");
    envFiles = [];
    // loadEnvironment threw before building anything. Rebuild the base
    // snapshot and derive the Wrangler alias by hand, the same as its success
    // path would have, so the Windows delegation and the alias still work
    // with no env file loaded.
    env = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) env[key] = value;
    }
    applyWranglerLocalDatabaseAlias(env);
  } else if (err instanceof UnknownEnvironmentError) {
    console.error(`with-env: ${err.message}`);
    process.exit(1);
  } else {
    throw err;
  }
}

/**
 * dotenvx's CLI entry point, resolved through its package rather than a `.bin`
 * shim: Node refuses to spawn `.cmd` without a shell, so the shim is not
 * something we can exec directly.
 */
function dotenvxCli(): string {
  try {
    const require = createRequire(import.meta.url);
    const pkgPath = require.resolve("@dotenvx/dotenvx/package.json");
    const { bin } = require("@dotenvx/dotenvx/package.json") as {
      bin?: string | Record<string, string | undefined>;
    };
    const entry = typeof bin === "string" ? bin : bin?.dotenvx;
    if (!entry) throw new Error("no bin entry");
    return join(dirname(pkgPath), entry);
  } catch {
    console.error(
      "with-env: cannot find @dotenvx/dotenvx — run `pnpm install` at the repo root.",
    );
    process.exit(1);
  }
}

// -c: evaluate the string with @yarnpkg/shell so $VAR resolves against the
// loaded files rather than against whatever pnpm's shell had already expanded.
if (shellMode && opts.c !== undefined) {
  const [{ npath }, { execute }] = await Promise.all([
    import("@yarnpkg/fslib"),
    import("@yarnpkg/shell"),
  ]);
  process.exit(
    await execute(opts.c, [], {
      // @yarnpkg/shell works in portable (forward-slash) paths; on Windows a
      // native path would not round-trip. This is a no-op on POSIX.
      cwd: npath.toPortablePath(cwd),
      env,
      stdin: process.stdin,
      stdout: process.stdout,
      stderr: process.stderr,
    }),
  );
}

// One process instead of two.
//
// This used to spawn dotenvx's CLI and have IT spawn the command, which meant a
// second Node startup plus dotenvx's own boot (commander, conf, systeminfo) on
// every invocation, 238ms of the 560ms measured above. Loading in-process and
// spawning the command directly removes that.
//
// ⚠️ WINDOWS STILL DELEGATES, and the reason is not stylistic. Since
// CVE-2024-27980 Node refuses to spawn `.cmd`/`.bat` without a shell, and on
// Windows every `node_modules/.bin` entry is a `.cmd` shim, so a direct spawn
// of `next` or `tsx` there fails outright. dotenvx uses execa, which handles it.
// `shell: true` is not the fix: it would break on any path containing a space,
// which on Windows is the ordinary case (`C:\Users\Firstname Lastname\...`).
const windows = process.platform === "win32";
// `env` was already loaded once, up front, on both platforms (see above).
// dotenvx is used below only as the .cmd-safe process launcher on Windows,
// not as a second loader.

const child = spawn(
  windows ? process.execPath : args[0]!,
  windows
    ? [
        dotenvxCli(),
        "run",
        "--quiet",
        // With no file selected, dotenvx would fall back to looking for its
        // own default `.env` and print a MISSING_ENV_FILE banner for the
        // absence this wrapper has already reported in its own words. The
        // delegation is still needed here because it is what spawns a `.cmd`
        // shim, so silence the duplicate rather than skipping the hop.
        ...(envFiles.length === 0 ? ["--ignore=MISSING_ENV_FILE"] : []),
        ...envFiles.flatMap((f) => ["-f", join(root, f)]),
        "--",
        ...args,
      ]
    : args.slice(1),
  { cwd, env, stdio: "inherit" },
);

child.on("error", (err: Error) => {
  console.error(`with-env: ${err.message}`);
  process.exit(1);
});
child.on("exit", (code: number | null, signal: NodeJS.Signals | null) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
