/**
 * Positional arguments, with flag values excluded.
 *
 * This is one small function in its own module because of one bug it exists to
 * prevent. What it returns first is the subcommand, and `pull`, `push` and
 * `audit` do very different things to live credentials. A naive
 * `filter((a) => !a.startsWith("--"))` reads the VALUE of a flag as a
 * positional:
 *
 *     env --file notes.env audit
 *                ^^^^^^^^^ a bare word that is not a subcommand
 *
 * There the mistake is loud, because `notes.env` is not a subcommand and the
 * command refuses. The quiet version is the one that matters:
 *
 *     env --file push audit
 *
 * which would run `push` — writing to Bitwarden and GitHub — when `audit`,
 * which writes nothing at all, is what was asked for.
 */

/**
 * Flags that consume the token after them.
 *
 * `--env` is in here even though nothing accepts it any more: it was this
 * CLI's spelling of `--target` until the two vocabularies behind it were
 * merged, and a stale `env push --env staging` in somebody's shell history
 * must not read `staging` as the subcommand. `cli.ts` rejects the flag by name
 * instead, which says what happened.
 */
export const VALUE_FLAGS = new Set([
  "--access-token",
  "--app",
  "--base-url",
  "--env",
  "--file",
  "--target",
  "--team",
]);

export function positionals(argv: readonly string[]): string[] {
  const found: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;

    if (!arg.startsWith("-")) {
      found.push(arg);
      continue;
    }

    // Skip the value, but only if it looks like one. `--file --yes` is a
    // mistake, and swallowing `--yes` would turn it into a silent one.
    const next = argv[i + 1];
    if (VALUE_FLAGS.has(arg) && next !== undefined && !next.startsWith("-")) {
      i += 1;
    }
  }

  return found;
}
