/**
 * What a `devtools deploy` command may print, and where it may print it.
 *
 * ## ⚠️ stdout belongs to the machine
 *
 * Every other command in this CLI talks through `@clack/prompts`, and every
 * one of its writers goes to **stdout**: `intro`, `outro`, `log.*`, `note`,
 * the spinner. Verified against @clack/prompts as vendored here on 2026-08-16
 * by running each of them with the two streams captured separately: stdout got
 * the whole box-drawn transcript and stderr got nothing.
 *
 * That is fine for a contributor at a terminal and wrong for this group: a
 * deploy command's stdout is a channel something downstream may PARSE or take
 * whole, `::add-mask::` directives and minted credentials among the things
 * that have lived there. So `cli.ts` prints no banner for the `deploy` group,
 * and everything in this group reports through `say()`, which is stderr,
 * instead of `log`/`note`. A `console.log` anywhere under this directory is a
 * bug: the next command with a real stdout protocol would inherit a
 * decoration it never asked for, silently, with no test catching it until
 * that command exists.
 *
 * ## Failures
 *
 * `DeployError` carries the same two-part shape the scripts these commands
 * grew out of printed by hand: a one-line message, then indented detail naming
 * the thing to go and fix. `cli.ts` renders it to stderr and sets a non-zero
 * exit code; a command that wants the failure in the job summary as well writes
 * that itself, because which failures deserve a summary entry is a per-command
 * judgement (`write-env`'s do; a bad flag does not).
 */
import { appendFileSync } from "node:fs";

/**
 * A deploy command's own refusal, as opposed to a crash.
 *
 * The distinction lets `cli.ts` print a message a person can act on instead of
 * a stack trace, and it is worth having even though both outcomes exit 1:
 * these commands run unattended, and the log line IS the report.
 */
export class DeployError extends Error {
  readonly detail: readonly string[];

  constructor(message: string, detail: readonly string[] = []) {
    super(message);
    this.name = "DeployError";
    this.detail = detail;
  }
}

/**
 * Prints to STDERR. The only way a deploy command should say anything.
 *
 * See the header for why this is not `log.message`: stdout is machine-read
 * here, and clack writes there.
 */
export function say(lines: readonly string[]): void {
  if (lines.length === 0) return;
  process.stderr.write(`${lines.join("\n")}\n`);
}

/**
 * Appends to the job summary under Actions; a no-op anywhere else.
 *
 * `env` is a parameter rather than a read of `process.env` so a test can point
 * it at a temporary file without mutating the ambient environment of whatever
 * else the runner is executing in the same process.
 */
export function summary(
  lines: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): void {
  const path = env.GITHUB_STEP_SUMMARY;
  if (!path) return;
  appendFileSync(path, `${lines.join("\n")}\n`);
}
