/**
 * What an `example` MEANS — the one place that decides whether the literal
 * after the `=` is a VALUE or merely a SHAPE.
 *
 * `EnvMeta.example` carries three different things under one field, and the
 * difference is invisible to the type system:
 *
 *   1. a DERIVATION — `"$API_URL"`, `"https://$PROJECT_REF.supabase.co"`,
 *      `"$BASE_URL/auth/callback"`. Not a guess at the value: it is how the
 *      value is built, everywhere, from another variable in the same file.
 *   2. a DEVELOPMENT DEFAULT — `"http://localhost:3000"`. A working value, in
 *      development and nowhere else.
 *   3. a PLACEHOLDER — `"000000"`, `PLACEHOLDER-NOT-A-REAL-KEY`, or the hybrid
 *      `postgresql://postgres.$PROJECT_REF:<password>@<host>:5432/postgres`,
 *      which is a real derivation with two fill-me holes punched in it.
 *
 * Only the first may be carried into a deployed environment. Both of the
 * others are ACTIVELY WRONG there and — because every consumer downstream
 * skips only EMPTY values — a wrong one propagates in silence: pushed to
 * Bitwarden, synced to GitHub, and then reported as no-drift by `env audit`,
 * because the stored value does match the file it came from.
 *
 * Two callers make this distinction and they must not disagree about it:
 * `scripts/deploy-write-env.ts` composing a deploy's env file, and
 * `env init --target <vault target>` rendering one to fill in by hand. When
 * they disagree, the file a person fills in and the file CI writes stop being
 * the same file, which is the class of bug the whole registry exists to close.
 */
import type { EnvMeta } from "./meta.js";

/**
 * `$NAME` and `${NAME}` — dotenvx's expansion syntax, restricted to the
 * SHOUTING_CASE shape every declared key has.
 *
 * Anchored on that shape deliberately: a bare `$` in a password or a price is
 * not a reference, and treating one as such would classify a placeholder as a
 * derivation — the exact mistake this module exists to prevent.
 */
const REFERENCE = /\$\{([A-Z][A-Z0-9_]*)\}|\$([A-Z][A-Z0-9_]*)/g;

/** A fill-me hole a human is expected to replace: `<password>`, `<host>`. */
const HOLE = /[<>]/;

/** The variable names a value expands from, in order, duplicates included. */
export function envReferences(value: string): string[] {
  // `matchAll` works on a copy of the regex, so the shared `/g` literal above
  // carries no `lastIndex` between calls.
  return [...value.matchAll(REFERENCE)].map((match) => (match[1] ?? match[2])!);
}

/**
 * The declared value when it is a derivation, and `null` for anything else.
 *
 * Three gates, each closing a case that reached production once:
 *
 *   * `secrecy === "public"`. A secret's `example` is never a value; it is a
 *     shape. `DB_URL`'s is
 *     `postgresql://postgres.$PROJECT_REF:<password>@<host>:5432/postgres`,
 *     which contains a genuine `$PROJECT_REF` and would otherwise read as a
 *     derivation — and shipping it would put a URL with the literal text
 *     `<password>` in it into a deployed environment.
 *   * at least one `$REF`. Without one there is nothing being derived, only a
 *     development default (`http://localhost:3000`) or a placeholder
 *     (`000000`) — the two kinds of wrong value that push cleanly.
 *   * no `<` or `>`. The hybrid case: a formula with holes in it is not a
 *     formula. Belt and braces against the `secrecy` gate, which happens to
 *     catch today's only example but is about a different property.
 *
 * ⚠️ Says nothing about whether the references RESOLVE. That depends on which
 * other keys the caller has, so each caller checks it: the deploy script
 * fails naming the missing input, `env init` leaves the line blank rather than
 * writing a formula the file cannot expand.
 */
export function derivationOf(meta: EnvMeta): string | null {
  if (meta.secrecy !== "public") return null;

  const example = meta.example;
  if (example === undefined || example === "") return null;
  if (HOLE.test(example)) return null;

  return envReferences(example).length > 0 ? example : null;
}
