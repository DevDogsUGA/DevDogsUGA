/**
 * Single env-loading helper for every workspace script:
 *
 *   pnpm -w run with-env [--local] <command> [args...]
 *   pnpm -w run with-env [--local] -c '<shell command>'
 *
 * Loads the root .env (plus .env.generated first, with --local) via dotenvx,
 * then runs the command back in the *calling* package's directory. pnpm runs
 * root scripts from the repo root, so without the chdir every wrapped script
 * would execute against the root instead of its own package.
 *
 * Use -c when the command needs a value *from* .env. A $VAR in the outer script
 * is expanded by pnpm's shell before this helper loads anything, so it would
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
import { readFileSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const usage =
  "with-env: usage: with-env [--local] <command> [args...]\n" +
  "                 with-env [--local] -c '<shell command>'";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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

// pnpm sets INIT_CWD to the directory the script was invoked from, and re-sets
// it on every invocation, so this stays correct through nested pnpm calls
// (`pnpm sb <cmd>`, --filter, turbo, Playwright's webServer).
const cwd = process.env.INIT_CWD ?? process.cwd();

// dotenvx applies the first file that defines a variable, so .env.generated
// (local stack) must precede .env.
const envFiles = local ? [".env.generated", ".env"] : [".env"];

// Root scripts only get the root node_modules/.bin on PATH; app-local bins
// (next, drizzle-kit, opennextjs-cloudflare) live in the caller's. Windows
// spells the variable "Path", so reuse whichever key is already present.
// Both dotenvx and @yarnpkg/shell want a string-only map, so drop the unset
// keys Node models as undefined.
const env: Record<string, string> = {};
for (const [key, value] of Object.entries(process.env)) {
  if (value !== undefined) env[key] = value;
}
const pathKey =
  Object.keys(env).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
env[pathKey] = [join(cwd, "node_modules", ".bin"), env[pathKey] ?? ""].join(
  delimiter,
);

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
const pkgDir = join(root, "node_modules", "@dotenvx", "dotenvx");
let cli: string;
try {
  const { bin } = JSON.parse(
    readFileSync(join(pkgDir, "package.json"), "utf8"),
  ) as { bin?: string | Record<string, string | undefined> };
  const entry = typeof bin === "string" ? bin : bin?.dotenvx;
  if (!entry) throw new Error("no bin entry");
  cli = join(pkgDir, entry);
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
