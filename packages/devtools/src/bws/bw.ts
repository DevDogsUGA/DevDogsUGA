/**
 * `pnpm devtools bw …` — the Bitwarden CLI, passed through untouched.
 *
 * This is not a command of this CLI wearing a Bitwarden hat. Everything after
 * `bw` goes to the real binary verbatim, and its exit code comes back
 * verbatim, because the thing people actually run is `bw login` and its
 * session handling is Bitwarden's business rather than ours.
 *
 * It exists because `@bitwarden/cli` is a dependency of this package, so the
 * binary sits in devtools' own `node_modules/.bin` and nowhere else. Before
 * this, reaching it meant a root alias (`pnpm bw`) that did
 * `pnpm --filter @devdogsuga/devtools exec bw` — the last script at the
 * workspace root whose whole job was to reach into this package.
 *
 * ⚠️ `cwd` is deliberately NOT overridden, unlike the turbo spawn in
 * `run/pick.ts`. pnpm puts this package's `node_modules/.bin` on PATH as a
 * relative entry, so moving the working directory would make `bw` unresolvable
 * from the very place it is installed. Bitwarden does not care where it runs.
 */
import { spawn } from "node:child_process";

/**
 * Runs the Bitwarden CLI with `args`, then exits with its status.
 *
 * Returns a promise that never settles, because every path out of it ends in
 * `process.exit`. That signature is load-bearing rather than pedantic: a
 * `void` return would let the caller carry on and print `outro("Done.")`
 * while `bw login` was still waiting for a master password.
 */
export function runBw(args: string[]): Promise<never> {
  return new Promise<never>(() => {
    const child = spawn("bw", args, { stdio: "inherit" });

    child.on("error", (err: Error) => {
      // ENOENT here means the dependency is not installed rather than that the
      // user mistyped, so say the thing that fixes it.
      console.error(
        `bw: ${err.message}\n` +
          "The Bitwarden CLI ships as a devtools dependency — " +
          "run `pnpm install` at the repo root.",
      );
      process.exit(1);
    });

    child.on("exit", (code: number | null, signal: NodeJS.Signals | null) => {
      // Re-raise rather than translating to a number: a Ctrl-C in `bw login`
      // should look to the shell exactly like a Ctrl-C in `bw login`.
      if (signal) process.kill(process.pid, signal);
      else process.exit(code ?? 1);
    });
  });
}
