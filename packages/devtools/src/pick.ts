/**
 * Choosing a target when the command line did not name one.
 *
 * `--target` is optional, and when it is absent this asks rather than guessing.
 * There is no safe default to fall back to, because the targets differ
 * precisely in how much damage picking the wrong one does.
 *
 * Three properties the prompt is built around:
 *
 *   * Production is never the highlighted option. The list is ordered least-
 *     to most-dangerous (that order lives in the target table), so a reflexive
 *     Enter selects `preflight`.
 *   * It refuses to prompt where nobody can answer. A prompt on a
 *     non-interactive stdin hangs until the job times out, which reads as a
 *     broken tool rather than a missing argument.
 *   * `development` is refused by name, not by silence. It is a real target
 *     with a file, and it is the one target with no Bitwarden project, so
 *     `pull`/`push`/`audit` cannot do anything with it. Letting it fall into
 *     "not a target" would say something false; the message says which fact
 *     rules it out.
 */
import { select } from "@clack/prompts";
import {
  ENV_TARGETS,
  VAULT_TARGETS,
  isEnvTarget,
  isVaultTarget,
  type VaultTarget,
} from "@devdogsuga/env";
import {
  NO_VAULT_PROJECT_HINTS,
  NoVaultProjectError,
} from "./bws/environments.js";
import { explain, unwrap } from "./ui.js";

/** Short enough to sit beside the name; the specs' summaries are paragraphs. */
const VAULT_HINTS: Record<VaultTarget, string> = {
  preflight: "read-only credentials for the pre-promotion checks",
  staging: "the everyday one — safe to overwrite",
  production: "⚠️  the live values",
};

/**
 * `null` means the failure has already been explained; set an exit code and
 * stop. It is not the same as a cancel, which exits the process outright.
 */
export async function resolveVaultTarget(
  given: string | undefined,
  message: string,
): Promise<VaultTarget | null> {
  if (given !== undefined) {
    if (isVaultTarget(given)) return given;

    if (isEnvTarget(given)) {
      explain(
        new NoVaultProjectError(given).message,
        "",
        NO_VAULT_PROJECT_HINTS,
      );
      return null;
    }

    explain(`"${given}" is not a target.`, "", [
      `Try one of: ${ENV_TARGETS.join(", ")}`,
      `Only ${VAULT_TARGETS.join(", ")} have a Bitwarden project.`,
    ]);
    return null;
  }

  if (!process.stdin.isTTY) {
    explain("No target given, and there is nobody here to ask.", "", [
      `Pass --target: ${VAULT_TARGETS.join(" | ")}`,
    ]);
    return null;
  }

  return unwrap(
    await select({
      message,
      options: VAULT_TARGETS.map((value) => ({
        value,
        hint: VAULT_HINTS[value],
      })),
    }),
  );
}
