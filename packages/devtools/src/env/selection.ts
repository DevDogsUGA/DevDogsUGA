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
 *   unknown  a key NO manifest declares. Also loud, and also never uploaded:
 *            an undeclared key used to ride along by omission, which meant a
 *            typo'd name uploaded garbage under the wrong key and a stray
 *            local variable uploaded something private. Fail closed — the
 *            registry is the allowlist, not the ignore lists.
 */
import {
  applyOnlyKeys,
  mintedKeys,
  neverSecretKeys,
  neverStoreKeys,
  variables,
} from "@devdogsuga/env";
import { type BwsEnvironment } from "../bws/environments.js";
import { assertRegistryLoaded } from "./discovery.js";

export interface PushSelection {
  push: Map<string, string>;
  refused: string[];
  /** Present in the file, declared by no manifest. Skipped, warned about. */
  unknown: string[];
}

// The key sets are DERIVED from the env manifests (see `discovery.ts`), not
// hand-listed here any more — which is why every function below insists the
// registry is loaded. An empty registry makes each selector return `[]`, and
// `[]` fails open in the one direction that matters: nothing would be refused,
// so `BWS_ACCESS_TOKEN` would upload.

/**
 * Non-secrets, the minted credentials, plus the apply-only ones outside
 * production.
 *
 * The apply-only two exist to reshape production, so a copy in staging or
 * preflight is a second write-capable token to rotate for no benefit.
 *
 * Minted credentials are here because there is nothing to send: the value is
 * signed at deploy time and its only copy is on the Worker. Skipping rather
 * than refusing, because "not pushed" is the ordinary state of one of these —
 * a refusal is for a credential somebody put in the file expecting it to sync,
 * and nobody has this one to put there.
 */
export function ignoredFor(environment: BwsEnvironment): Set<string> {
  assertRegistryLoaded();
  const skip = new Set<string>(neverSecretKeys());
  for (const key of mintedKeys()) skip.add(key);
  if (environment !== "production") {
    for (const key of applyOnlyKeys()) skip.add(key);
  }
  return skip;
}

export function neverStore(): Set<string> {
  assertRegistryLoaded();
  return new Set<string>(neverStoreKeys());
}

/**
 * Signed at deploy time; the deploy target holds the only copy.
 *
 * Passed to `audit` separately from `ignoredFor()` even though it is a subset,
 * because the audit needs the distinction: an ignored key is uninteresting
 * everywhere, whereas a minted one is CORRECT on Cloudflare (which is what
 * stops it being reported as an orphan and pruned) and WRONG in Bitwarden or
 * GitHub.
 */
export function minted(): Set<string> {
  assertRegistryLoaded();
  return new Set<string>(mintedKeys());
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
  const declared = variables();

  const push = new Map<string, string>();
  const refused: string[] = [];
  const unknown: string[] = [];

  for (const [key, value] of entries) {
    // Refusal is checked FIRST and independently of the value. A blank
    // BWS_ACCESS_TOKEN is still a line somebody is about to fill in.
    if (refuse.has(key)) {
      if (value !== "") refused.push(key);
      continue;
    }
    // Undeclared means unclassified: nothing says whether this is a secret,
    // whose it is, or where it routes — so it does not leave the machine.
    // Reported even when empty, because the problem is the missing
    // declaration, not the value.
    if (!declared.has(key)) {
      unknown.push(key);
      continue;
    }
    if (skip.has(key)) continue;
    // An empty secret reads as "configured" to every consumer that checks for
    // presence, which is worse than an absent one.
    if (value === "") continue;

    push.set(key, value);
  }

  return { push, refused, unknown };
}
