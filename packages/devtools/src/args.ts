/**
 * Positional arguments, with flag values excluded.
 *
 * This is one small function in its own module because of one bug it exists to
 * prevent. The environment is now a positional — `secrets push staging` — so
 * whatever this returns second decides which project gets overwritten. And a
 * naive `filter((a) => !a.startsWith("--"))` reads the VALUE of a flag as a
 * positional:
 *
 *     secrets push --file .env.staging
 *                         ^^^^^^^^^^^^ a bare word that is not an environment
 *
 * There the mistake is loud, because `.env.staging` is not a valid environment
 * name and the command refuses. The quiet version is the one that matters:
 *
 *     secrets push --file production
 *
 * which would push the file named `production` to the production project,
 * having been asked for neither.
 */

/** Flags that consume the token after them. */
export const VALUE_FLAGS = new Set([
  "--app",
  "--base-url",
  "--env",
  "--file",
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
