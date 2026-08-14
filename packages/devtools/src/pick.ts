/**
 * Choosing an environment when the command line did not name one.
 *
 * `--env` is optional, and when it is absent this asks rather than guessing.
 * Nothing else in this CLI defaults to anything but the local stack; here there
 * is no safe default to fall back to, because the three environments differ
 * precisely in how much damage picking the wrong one does.
 *
 * Two properties the prompt is built around:
 *
 *   * **Production is never the highlighted option.** The list is ordered
 *     least- to most-dangerous, so a reflexive Enter selects `preflight`.
 *   * **It refuses to prompt where nobody can answer.** A prompt on a
 *     non-interactive stdin hangs until the job times out, which reads as a
 *     broken tool rather than a missing argument.
 */
import { select } from "@clack/prompts";
import {
  ENVIRONMENTS,
  isEnvironment,
  type BwsEnvironment,
} from "./bws/environments.js";
import { explain, unwrap } from "./ui.js";

/** Short enough to sit beside the name; the specs' summaries are paragraphs. */
const BWS_HINTS: Record<BwsEnvironment, string> = {
  "preflight": "read-only credentials for the pre-promotion checks",
  staging: "the everyday one — safe to overwrite",
  production: "⚠️  the live values",
};

/**
 * `null` means the failure has already been explained; set an exit code and
 * stop. It is not the same as a cancel, which exits the process outright.
 */
export async function resolveEnvironment(
  given: string | undefined,
  message: string,
): Promise<BwsEnvironment | null> {
  const checked = precheck(given, ENVIRONMENTS, isEnvironment);
  if (checked !== ASK) return checked;

  return unwrap(
    await select({
      message,
      options: ENVIRONMENTS.map((value) => ({ value, hint: BWS_HINTS[value] })),
    }),
  );
}

const ASK = Symbol("ask");

/** Validates what was named, or reports that asking is the way forward. */
function precheck<T extends string>(
  given: string | undefined,
  all: readonly T[],
  valid: (value: string) => value is T,
): T | null | typeof ASK {
  if (given !== undefined) {
    if (valid(given)) return given;
    explain(`"${given}" is not an environment.`, "", [
      `Try one of: ${all.join(", ")}`,
    ]);
    return null;
  }

  if (!process.stdin.isTTY) {
    explain("No environment given, and there is nobody here to ask.", "", [
      `Pass --env: ${all.join(" | ")}`,
    ]);
    return null;
  }

  return ASK;
}
