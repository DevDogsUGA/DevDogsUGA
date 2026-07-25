/**
 * Single env-loading helper for every workspace script:
 *
 *   with-env [--local] <command> [args...]
 *   with-env [--local] -c '<shell command>'
 *
 * Loads the monorepo's root .env (plus .env.generated first, with --local) via
 * dotenvx and runs the command with it. Installed as a bin, so it inherits the
 * calling package's directory and its node_modules/.bin — no chdir or PATH
 * fixup needed.
 *
 * Use -c when the command needs a value *from* .env. A $VAR in the script is
 * expanded by pnpm's shell before this helper loads anything, so it would
 * resolve against the ambient environment; quoting it and passing it to -c
 * defers expansion until after the env is loaded. -c runs the string through
 * @yarnpkg/shell — the same JS shell pnpm's shellEmulator uses — so it stays
 * cross-platform.
 *
 * Neither mode spawns a platform shell, so this works on Windows and POSIX.
 */
import dx from "@dotenvx/dotenvx";
import { npath } from "@yarnpkg/fslib";
import { execute } from "@yarnpkg/shell";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const usage =
  "with-env: usage: with-env [--local] <command> [args...]\n" +
  "                 with-env [--local] -c '<shell command>'";

// Walk up for the workspace marker rather than assuming a fixed depth, so the
// helper keeps working if this package is ever moved.
function findRoot(from: string): string {
  for (let dir = from; ; ) {
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

const args = process.argv.slice(2);
let local = false;
let shellMode = false;
for (;;) {
  if (args[0] === "--local") {
    local = true;
    args.shift();
  } else if (args[0] === "-c") {
    shellMode = true;
    args.shift();
  } else break;
}

if (args.length === 0) {
  console.error(usage);
  process.exit(1);
}
if (shellMode && args.length > 1) {
  console.error("with-env: -c takes a single quoted string\n" + usage);
  process.exit(1);
}

// Running as a bin, the cwd is already the package whose script invoked us.
const cwd = process.cwd();

// dotenvx applies the first file that defines a variable, so .env.generated
// (local stack) must precede .env.
const envFiles = local ? [".env.generated", ".env"] : [".env"];

// Both dotenvx and @yarnpkg/shell want a string-only map, so drop the unset
// keys Node models as undefined.
const env: Record<string, string> = {};
for (const [key, value] of Object.entries(process.env)) {
  if (value !== undefined) env[key] = value;
}

// -c: load the env in-process and evaluate the string with @yarnpkg/shell, so
// $VAR resolves against the loaded files. dotenvx's Node API applies the same
// rules as its CLI — first file wins, and values already in the environment are
// left alone.
const command = args[0];
if (shellMode && command !== undefined) {
  dx.config({
    path: envFiles.map((f) => join(root, f)),
    processEnv: env,
    quiet: true,
  });
  process.exit(
    await execute(command, [], {
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

// Resolve dotenvx's entry point and run it with the current node binary, so we
// never depend on a .bin shim (Node refuses to spawn .cmd without a shell).
let cli: string;
try {
  const require = createRequire(import.meta.url);
  const pkgPath = require.resolve("@dotenvx/dotenvx/package.json");
  const { bin } = require("@dotenvx/dotenvx/package.json") as {
    bin?: string | Record<string, string | undefined>;
  };
  const entry = typeof bin === "string" ? bin : bin?.dotenvx;
  if (!entry) throw new Error("no bin entry");
  cli = join(dirname(pkgPath), entry);
} catch {
  console.error(
    "with-env: cannot find @dotenvx/dotenvx — run `pnpm install` at the repo root.",
  );
  process.exit(1);
}

const child = spawn(
  process.execPath,
  [
    cli,
    "run",
    "--quiet",
    ...envFiles.flatMap((f) => ["-f", join(root, f)]),
    "--",
    ...args,
  ],
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
