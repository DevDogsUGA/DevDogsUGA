/**
 * Positional arguments, with flag values excluded.
 *
 * Its own module because of one bug it prevents. The first positional is the
 * subcommand, and `pull`, `push` and `audit` do very different things to live
 * credentials. A naive `filter((a) => !a.startsWith("--"))` reads a flag's
 * VALUE as a positional, so `env --file notes.env audit` fails loudly:
 * `notes.env` is not a subcommand and the command refuses. The quiet version
 * is the one that matters:
 *
 *     env --file push audit
 *
 * which runs `push`, writing to Bitwarden and GitHub, when the caller asked
 * for `audit`, which writes nothing at all.
 */

/**
 * Flags that consume the token after them.
 *
 * `--env` is here even though nothing accepts it any more. It was this CLI's
 * spelling of `--target` until the two vocabularies behind it were merged, and
 * a stale `env push --env staging` in somebody's shell history must not read
 * `staging` as the subcommand. `cli.ts` rejects the flag by name instead,
 * which says what happened.
 *
 * `--mint` is deliberately NOT here. It takes no value any more: the command
 * it runs is a sibling of the one that calls it, not a path a caller supplies.
 * So `deploy secrets-file --app sandbox --mint` must leave the following
 * token, if any, visible as a positional for `cli.ts` to refuse.
 */
export const VALUE_FLAGS = new Set([
  "--access-token",
  // `qr`: every value flag, so `qr --out poster.png https://…` still reads
  // the URL as the text and not `poster.png`.
  "--background",
  "--color",
  "--ecl",
  "--format",
  // `images`: so `images --format og page/events` reads `og` as the format and
  // `page/events` as the graphic, not both as graphics.
  "--format",
  "--logo",
  "--logo-padding",
  "--logo-size",
  "--margin",
  "--out",
  "--size",
  "--text",
  "--version",
  "--app",
  "--base-url",
  "--env",
  "--file",
  "--source",
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
