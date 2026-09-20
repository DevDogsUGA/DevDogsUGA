/**
 * Records the fully-resolved argv of the command being run, so the CLI can
 * close by printing a copy-pasteable line — the same command with every prompt
 * already answered — for anyone who reached it through the wizard or let a
 * missing flag fall to a prompt.
 *
 * ## Why a module-level recorder rather than a return value
 *
 * A command's inputs arrive from two places that never meet: the wizard walks
 * `commands.ts` and gathers the *declared* options into the argv it dispatches
 * (see `menu.ts`), while a runner resolves anything it prompts for *itself* —
 * `workflows run` picking a tier, `env init` picking projects — deep inside its
 * own call stack, where the dispatched argv is long out of reach. Threading a
 * return value back up through every runner would touch each one's signature;
 * a recorder every layer can reach touches only the layers that actually
 * prompt.
 *
 * The rule for a runner: whenever a prompt (not a flag the caller already
 * passed) decides a value, `recordResolved` the flag form of that decision. A
 * value that came in as a flag is already in the base argv, so recording it
 * again would double it — only the prompt branch records.
 */

/** The base argv plus whatever prompts resolved; `null` until an invocation begins. */
let argv: string[] | null = null;

/** Did the wizard, or an in-command prompt, actually decide anything here? */
let interactive = false;

/**
 * The deploy tier the wizard entered for this session, or `null` for the
 * development default. Reproduced as a `DEPLOY_ENV=<tier>` prefix rather than a
 * `--tier` flag, because it is `DEPLOY_ENV` the wizard actually set and — unlike
 * `--tier`, which only the tier-aware commands parse — it reproduces the tier
 * for EVERY command, `db` and `env` included.
 */
let enteredTier: string | null = null;

/**
 * Start recording for one invocation.
 *
 * `base` is what the dispatcher received: the wizard's built argv, or the argv
 * the user typed. `fromMenu` marks the wizard path, where every step was a
 * prompt, so the rerun line is worth printing even if no runner records a
 * thing. A typed command starts non-interactive and only earns the line if a
 * runner resolves a missing flag from a prompt.
 */
export function beginInvocation(
  base: readonly string[],
  fromMenu: boolean,
): void {
  argv = [...base];
  interactive = fromMenu;
  enteredTier = null;
}

/**
 * Record the deploy tier the wizard entered up front, so the rerun line carries
 * it. development is the ambient default, so a prefix for it would be noise and
 * is dropped.
 */
export function recordEnteredTier(tier: string): void {
  enteredTier = tier === "development" ? null : tier;
}

/**
 * Append the flag form of a value a prompt just resolved, e.g.
 * `recordResolved("--tier", "development")`.
 */
export function recordResolved(...fragment: string[]): void {
  if (argv === null || fragment.length === 0) return;
  argv.push(...fragment);
  interactive = true;
}

/**
 * The command to print, or `null` when there is nothing worth printing —
 * either no invocation ran, or the user typed a complete command and answered
 * no prompts, so echoing it back would be noise.
 */
export function reproducibleCommand(): string | null {
  if (argv === null || !interactive || argv.length === 0) return null;
  const prefix = enteredTier ? `DEPLOY_ENV=${enteredTier} ` : "";
  return `${prefix}pnpm devtools ${argv.join(" ")}`;
}
