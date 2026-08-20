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
 *   derived   the value in the file is still, byte for byte, the DERIVATION the
 *             registry declares — a shape rather than a value. Left to the
 *             registry, and its own outcome rather than a silent skip.
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
  derivationOf,
  holdsOnlyNarrowedKeys,
  mintedKeys,
  narrowedKeys,
  neverSecretKeys,
  neverStoreKeys,
  planOnlyKeys,
  storableKeys,
  variableKeys,
  variables,
  type EnvEntry,
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
  /**
   * Left to the registry: the file still holds the declared derivation itself.
   *
   * Its own outcome rather than part of the skipped-and-unreported majority,
   * because `env init --target` WRITES these lines — eight of them — and a push
   * that said nothing about them would read as "your eight `$VAR` lines were
   * stored". They were not, deliberately. See `selectForPush()`.
   */
  derived: string[];
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
 *
 * ⚠️ AND, for a target no app boots from, EVERYTHING THAT DID NOT OPT IN. This
 * is the one exclusion that inverts the default — a deployed target skips a
 * named few, `preflight` skips all but a named few — and it inverts it because
 * the two questions are different. "Which keys does staging not want?" has a
 * short answer; "which credentials may a CI-only tier hold?" has the answer
 * "the ones deliberately narrowed for it, and nothing by omission". Until this
 * existed, `env push --target preflight` uploaded `SUPABASE_JWT_SIGNING_KEY`,
 * `SECRET_KEY` and `GH_APP_PRIVATE_KEY` into a project whose GitHub
 * environment is reachable from `main`. Both halves are derived — the target
 * from `deployEnv: false`, the keys from `EnvMeta.narrowed` — so neither is a
 * list to keep up to date.
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
  // Plan-tier keys are read by exactly two jobs: `main-plan` (preflight) and
  // `production-plan` (production). Everywhere else — staging today — a copy
  // is a credential nothing reads, so it is skipped the same way the
  // apply-tier pair is. Preflight is NOT excluded here: the narrowed-only
  // branch below already decides that target key by key, and a plan-tier key
  // reaches it through its `narrowed` opt-in.
  if (target !== "production" && !holdsOnlyNarrowedKeys(target)) {
    for (const key of planOnlyKeys()) skip.add(key);
  }
  if (holdsOnlyNarrowedKeys(target)) {
    const narrow = new Set<string>(narrowedKeys());
    // Over every DECLARED key, not over the routable ones: this set is also
    // what `audit` treats as uninteresting and what `push` reports orphans
    // against, and both want the full answer.
    for (const key of variables().keys()) {
      if (!narrow.has(key)) skip.add(key);
    }
  }
  return skip;
}

export function neverStore(): Set<string> {
  assertRegistryLoaded();
  return new Set<string>(neverStoreKeys());
}

/**
 * The keys a push for this target ROUTES — its two destinations, unioned.
 *
 * The complement of everything above, stated positively, because one consumer
 * needs the question the other way round: `env init --target staging` renders
 * a file whose whole purpose is to be filled in and pushed, so the keys it
 * should contain are exactly the keys a push for that target would carry
 * somewhere. Derived from `ignoredFor()` rather than re-listed, so the file
 * and the upload cannot disagree about which target a key belongs to — the
 * generated file used to be byte-identical for all three targets, which put
 * the apply-tier credentials in `.env.staging` where `ignoredFor()` refuses
 * them. The same derivation is what shrank `env init --target preflight` from
 * 45 keys to the narrowed ones: the exclusion is stated once, in `ignoredFor()`,
 * and the rendered file follows for free.
 *
 * The `neverStore()` subtraction is unreachable today (a never-store key is
 * neither `secrecy: "secret"` nor `"public"`, so neither selector returns it)
 * and is written down anyway: this set decides what gets an assignable line in
 * a file people fill in, and `BWS_ACCESS_TOKEN=` is the one line that must
 * never appear in one.
 */
export function keysRoutedTo(target: VaultTarget): Set<string> {
  assertRegistryLoaded();
  const skip = ignoredFor(target);
  const refuse = neverStore();
  return new Set<string>(
    [...storableKeys(), ...variableKeys()].filter(
      (key) => !skip.has(key) && !refuse.has(key),
    ),
  );
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
 * Whether the file's value is still, exactly, the derivation the registry
 * declares for this key.
 *
 * ⚠️ EXACT IDENTITY, and nothing looser. Not "looks like a formula", not
 * "contains a `$`", not "starts with the derivation" — string equality with
 * what `derivationOf()` returns. Everything else somebody could type is
 * deliberate input: a real value, obviously, but also a DIFFERENT derivation,
 * which is how a target says its value is built from something else. Widening
 * this predicate by one inch silently drops a credential on the floor, and a
 * dropped credential is a worse bug than the one this closes — the push
 * reports success, the environment is missing a secret, and `env audit` agrees
 * with the file it came from.
 *
 * `some` rather than `every` across duplicate declarations, matching
 * `keysWhere()`: the safe reading is that a value matching ANY declared
 * derivation is that derivation. It cannot discard a credential either way —
 * no usable credential is byte-identical to `$BASE_URL/auth/callback`.
 */
function isDeclaredDerivation(
  entries: readonly EnvEntry[],
  value: string,
): boolean {
  // `derivationOf()` returns null for everything that is not a derivation, and
  // `value` is non-empty by the time this is called, so null never matches.
  return entries.some((entry) => derivationOf(entry.meta) === value);
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
  const derived: string[] = [];

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

    // Still the declared derivation, so there is no VALUE here — only the
    // shape, which the registry already holds. Storing it is actively harmful
    // rather than merely redundant: a stored value BEATS the registry when the
    // deploy composes an env file, so the literal `https://$PROJECT_REF...`
    // arrives as `from: "variable"`, is never expanded (only `from: "derived"`
    // is), and is written single-quoted, which dotenvx takes as fully literal.
    // The deployed app then resolves a host called `$PROJECT_REF.supabase.co`
    // while `env audit` reports NO DRIFT, because the stored value does match
    // the file.
    //
    // ⚠️ NOT expanded here and sent, which is the tempting alternative. That
    // would make GitHub the source of truth for these eight shapes: changing
    // `REST_URL` from `/rest/v1` to `/rest/v2` in the registry would then never
    // take effect anywhere. Skipping is what lets the deploy's `fromRegistry()`
    // run and expand at compose time.
    if (isDeclaredDerivation(declared.get(key)!, value)) {
      derived.push(key);
      continue;
    }

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

  return { push, variables: publicValues, refused, unknown, derived };
}
