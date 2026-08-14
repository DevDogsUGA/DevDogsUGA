/**
 * Which values leave this machine.
 *
 * Pure, and separate from the command that uploads, because this is the single
 * decision with no undo behind it. Once a credential is in Bitwarden and synced
 * to GitHub, "take it back" means rotating it at the issuer and hoping nothing
 * read it in between — so the rule about what may go is worth stating once, in
 * one place, with tests on it.
 *
 * Three outcomes, and the difference between the last two matters:
 *
 *   push     a secret for this environment
 *   skipped  not a secret here — a GitHub *variable*, an empty value, or a
 *            credential belonging to a different environment. Uninteresting.
 *   refused  a credential that must not be stored remotely AT ALL. Reported
 *            loudly, because somebody who put it in the file expecting it to
 *            sync has to learn that it did not.
 */
import {
  APPLY_ONLY_KEYS,
  NEVER_SECRET_KEYS,
  NEVER_STORE_KEYS,
  type BwsEnvironment,
} from "../bws/environments.js";

export interface PushSelection {
  push: Map<string, string>;
  refused: string[];
}

/**
 * Non-secrets, plus the apply-only credentials outside production.
 *
 * Those two exist to reshape production, so a copy in staging or preflight is a
 * second write-capable token to rotate for no benefit.
 */
export function ignoredFor(environment: BwsEnvironment): Set<string> {
  const skip = new Set<string>(NEVER_SECRET_KEYS);
  if (environment !== "production") {
    for (const key of APPLY_ONLY_KEYS) skip.add(key);
  }
  return skip;
}

export function neverStore(): Set<string> {
  return new Set<string>(NEVER_STORE_KEYS);
}

/**
 * `entries` is the ACTIVE assignments in the local `.env`, in file order.
 *
 * A commented-out line is not an assignment and never reaches here, which is
 * what makes commenting-out a safe way to retire a key.
 */
export function selectForPush(
  entries: readonly (readonly [string, string])[],
  environment: BwsEnvironment,
): PushSelection {
  const skip = ignoredFor(environment);
  const refuse = neverStore();

  const push = new Map<string, string>();
  const refused: string[] = [];

  for (const [key, value] of entries) {
    // Refusal is checked FIRST and independently of the value. A blank
    // BWS_ACCESS_TOKEN is still a line somebody is about to fill in.
    if (refuse.has(key)) {
      if (value !== "") refused.push(key);
      continue;
    }
    if (skip.has(key)) continue;
    // An empty secret reads as "configured" to every consumer that checks for
    // presence, which is worse than an absent one.
    if (value === "") continue;

    push.set(key, value);
  }

  return { push, refused };
}
