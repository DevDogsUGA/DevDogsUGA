/**
 * Which values leave this machine.
 *
 * Pure, and separate from the command that uploads, because this is the single
 * decision with no undo behind it. Once a credential is in Bitwarden and synced
 * to GitHub, "take it back" means rotating it at the issuer and hoping nothing
 * read it in between — so the rule about what may go is worth stating once, in
 * one place, with tests on it.
 *
 * Four outcomes, and the difference between the last two matters:
 *
 *   push      a secret for this target
 *   variables a PUBLIC per-environment value: Bitwarden, then a GitHub
 *             *variable* rather than a secret. Its own outcome, not a skip —
 *             these used to fall into "uninteresting" and so had no remote
 *             home at all, which meant CI never received them and `pull` on a
 *             fresh machine could not reconstruct a working environment.
 *   skipped   nothing here to send: an empty value, a committed or
 *             developer-scoped constant, a minted credential, or one belonging
 *             to a different target. Uninteresting, and not returned.
 *   refused   a credential that must not be stored remotely AT ALL. Reported
 *             loudly, because somebody who put it in the file expecting it to
 *             sync has to learn that it did not.
 *   unknown   a key NO manifest declares. Also loud, and also never uploaded:
 *             an undeclared key used to ride along by omission, which meant a
 *             typo'd name uploaded garbage under the wrong key and a stray
 *             local variable uploaded something private. Fail closed — the
 *             registry is the allowlist, not the ignore lists.
 *
 * `push` and `variables` are disjoint by construction: `storableKeys()` and
 * `variableKeys()` differ only in `secrecy`, so no key can be in both, and the
 * loop below routes to one or the other and never to neither-nor-both.
 */
import {
  applyOnlyKeys,
  mintedKeys,
  neverSecretKeys,
  neverStoreKeys,
  variableKeys,
  variables,
} from "@devdogsuga/env";
import { type VaultTarget } from "../bws/environments.js";
import { assertRegistryLoaded } from "./discovery.js";

export interface PushSelection {
  push: Map<string, string>;
  /**
   * Public per-environment values, bound for Bitwarden and for GitHub
   * *variables*. Plaintext at both ends — no libsodium sealing, and readable
   * back through the API, which is what lets `audit` compare them by value.
   */
  variables: Map<string, string>;
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
 * Public per-environment values: Bitwarden, and then GitHub *variables*.
 *
 * Symmetric with `neverStore()` and `minted()` — a set, read at call time,
 * refusing an empty registry. See `variableKeys()` for why the set is narrower
 * than "every public key" and why the five `localStack` ones are still in it.
 */
export function pushableVariables(): Set<string> {
  assertRegistryLoaded();
  return new Set<string>(variableKeys());
}

/**
 * Nothing to send: the committed and per-developer non-secrets, the minted
 * credentials, plus the apply-only ones outside production.
 *
 * ⚠️ This is `neverSecretKeys()` MINUS the pushable variables, and the
 * subtraction is the change that gave 27 public, environment-scoped values a
 * remote home. They used to land here — "not a secret, therefore uninteresting"
 * — which conflated two different facts: that a value must not be a GitHub
 * *secret* (true of all of them) and that it goes nowhere (true only of the
 * committed and per-developer ones). Every consumer of this set reads it as the
 * second, so the first no longer belongs in it.
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
export function ignoredFor(target: VaultTarget): Set<string> {
  assertRegistryLoaded();
  const pushable = pushableVariables();
  const skip = new Set<string>(
    neverSecretKeys().filter((key) => !pushable.has(key)),
  );
  for (const key of mintedKeys()) skip.add(key);
  if (target !== "production") {
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
  target: VaultTarget,
): PushSelection {
  const skip = ignoredFor(target);
  const refuse = neverStore();
  const pushable = pushableVariables();
  const declared = variables();

  const push = new Map<string, string>();
  const publicValues = new Map<string, string>();
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
    // Checked BEFORE the variable branch, so the exclusions that are about
    // *this target* keep winning: an apply-only key outside production,
    // or a minted one anywhere, is skipped whatever its secrecy. The two sets
    // are disjoint today, and this ordering is what keeps a future overlap
    // failing closed rather than open.
    if (skip.has(key)) continue;
    // An empty secret reads as "configured" to every consumer that checks for
    // presence, which is worse than an absent one. Equally true of a variable:
    // an empty `PROJECT_REF` builds a URL pointing at nothing.
    if (value === "") continue;

    // Public and per-environment: a GitHub *variable*, not a secret. Routed
    // here rather than dropped, because the value still has to reach CI — and
    // still belongs in Bitwarden, so that `pull` rebuilds a COMPLETE env file
    // rather than the secret half of one.
    if (pushable.has(key)) {
      publicValues.set(key, value);
      continue;
    }

    push.set(key, value);
  }

  return { push, variables: publicValues, refused, unknown };
}
