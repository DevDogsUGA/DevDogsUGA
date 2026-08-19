/**
 * `define()` — the only way to add an environment variable.
 *
 * Two things happen at once, and coupling them is the point: the schema that
 * validates the value and the declaration of where that value may live are the
 * same statement. You cannot add a variable to an app without also saying
 * whether it is a secret, because the app will not compile otherwise.
 *
 * Everything downstream is derived from what accumulates here — `.env.example`,
 * which keys `env push` sends to Bitwarden, which reach the `production`
 * GitHub environment versus `production-apply`, and the drift check that says
 * a declared variable is missing from a deployed environment. None of those
 * are lists anybody maintains by hand any more, which is the entire reason
 * this package exists.
 */
import { z } from "zod";
import type { EnvMeta } from "./meta.js";

export type { EnvMeta, EnvScope, EnvSecrecy, EnvTier } from "./meta.js";

/**
 * One registered variable: its schema, its metadata, and where it was declared.
 *
 * `source` exists for the error messages. Two apps declaring the same key with
 * disagreeing metadata is a real and easy mistake — `DISCORD_TOKEN` as a secret
 * in one manifest and public in another — and "declared in two places" is
 * useless without saying which two.
 */
export interface EnvEntry {
  key: string;
  schema: z.ZodType;
  meta: EnvMeta;
  source: string;
  /** Client-exposed, i.e. inlined into a browser bundle. */
  client: boolean;
}

/**
 * The accumulated declarations, keyed by variable name.
 *
 * A module-level map rather than something threaded through call sites,
 * because the manifests are imported for their side effects by exactly one
 * consumer that wants all of them at once: the completeness test. Application
 * code only ever wants its own `env` object.
 */
const registry = new Map<string, EnvEntry[]>();

/**
 * zod's own registry, kept alongside so a schema carries its metadata even when
 * it has been passed somewhere the map is not in scope.
 */
export const envRegistry = z.registry<EnvMeta>();

/**
 * Declares a variable.
 *
 * The second argument is REQUIRED, and that is the whole mechanism. zod's
 * `.meta()` is optional to call, so metadata attached that way is metadata
 * somebody can forget; a wrapper that will not typecheck without it cannot be
 * forgotten. This is the difference between a convention and a rule.
 */
export function define<T extends z.ZodType>(schema: T, meta: EnvMeta): T {
  envRegistry.add(schema, meta);
  return schema.meta(meta) as T;
}

/** Reads back what a schema was declared as, if it went through `define()`. */
export function metaOf(schema: z.ZodType): EnvMeta | undefined {
  return envRegistry.get(schema);
}

export interface Manifest {
  /** Where these were declared, for error messages: "platform", "supabase". */
  source: string;
  server: Record<string, z.ZodType>;
  client?: Record<string, z.ZodType>;
}

export class UndeclaredVariableError extends Error {
  constructor(source: string, keys: string[]) {
    super(
      `${source} passes ${keys.length === 1 ? "a variable" : "variables"} that ` +
        `did not go through define(): ${keys.join(", ")}. ` +
        "Wrap the schema in define(schema, { doc, scope, secrecy }) so the " +
        "variable can be routed to the right environment.",
    );
    this.name = "UndeclaredVariableError";
  }
}

/**
 * Records a manifest's declarations.
 *
 * Called by each app's `env.ts` alongside `createEnv`, rather than replacing
 * it: `@t3-oss/env-nextjs` does real work this has no interest in duplicating —
 * the client/server split, the runtime-vs-build distinction, and the proxy that
 * throws when server-only config is read in a browser bundle.
 *
 * ⚠️ Refuses a schema that did not go through `define()`. Without that check
 * this is a registry that silently under-reports: a variable added the obvious
 * way (`FOO: z.string()`) would validate perfectly, boot the app, and be absent
 * from every derived artifact — which is the exact failure the whole package
 * exists to remove, reintroduced one level up.
 */
export function declare(manifest: Manifest): void {
  const undeclared: string[] = [];

  const record = (
    entries: Record<string, z.ZodType>,
    client: boolean,
  ): void => {
    for (const [key, schema] of Object.entries(entries)) {
      const meta = envRegistry.get(schema);
      if (!meta) {
        undeclared.push(key);
        continue;
      }
      const existing = registry.get(key) ?? [];
      existing.push({ key, schema, meta, source: manifest.source, client });
      registry.set(key, existing);
    }
  };

  record(manifest.server, false);
  if (manifest.client) record(manifest.client, true);

  if (undeclared.length > 0) {
    throw new UndeclaredVariableError(manifest.source, undeclared);
  }
}

/** Every declaration, in declaration order, including duplicates across apps. */
export function declarations(): EnvEntry[] {
  return [...registry.values()].flat();
}

/** One entry per variable name, collapsing agreeing declarations. */
export function variables(): Map<string, EnvEntry[]> {
  return new Map(registry);
}

/** Test seam. Application code has no reason to call this. */
export function resetRegistry(): void {
  registry.clear();
}

// ── Derived selectors ────────────────────────────────────────────────────────
//
// These replace the hand-maintained arrays in devtools/src/bws/environments.ts.
// The arrays were correct; what they could not do is stay correct, because
// nothing connected them to the schemas they described. A key added to
// `env.ts` and not to NEVER_SECRET_KEYS was pushed to Bitwarden as a secret,
// which is a second source of truth for a value that is also committed.

/**
 * Variables `env push` may send onward as GitHub Actions **secrets**.
 *
 * Its public counterpart is `variableKeys()` below: same scope, same minted
 * exclusion, opposite secrecy — and between them they cover every
 * environment-scoped key, which is what makes Bitwarden a COMPLETE picture of
 * an environment rather than the secret half of one.
 *
 * `minted` is excluded, and the exclusion is a fail-closed one rather than a
 * tidiness: a minted credential is signed at deploy time and has no stored
 * copy, so a value found under that name in somebody's `.env` is a hand-pasted
 * token that must not be propagated — uploading it would create the long-lived
 * copy the design exists to avoid.
 */
export function storableKeys(): string[] {
  return keysWhere(
    (e) =>
      e.meta.scope === "environment" &&
      e.meta.secrecy === "secret" &&
      e.meta.minted !== true,
  );
}

/**
 * Variables `env push` may send as GitHub **variables** rather than secrets.
 *
 * The mirror of `storableKeys()`, differing in one field — `secrecy: "public"`
 * instead of `"secret"` — and that one field is the whole routing decision.
 * Two concrete reasons these are not simply stored as secrets:
 *
 *   * GitHub MASKS a secret's value in logs, by substring. `PROJECT_REF` as a
 *     secret turns the paused-project link
 *     `https://supabase.com/dashboard/project/<ref>` into `.../***`, which is
 *     the entire point of that gate — and because the ref is a substring of
 *     `REST_URL`, `API_URL` and every Supabase hostname, the masking corrupts
 *     unrelated log lines repo-wide.
 *   * Variables are READABLE through the API; secrets are write-only. So
 *     `env audit` can compare these by VALUE, which is the limitation the
 *     security plan's §3.6 otherwise concedes ("a changed value is
 *     undetectable").
 *
 * ⚠️ `scope === "environment"` is doing real work and must not be relaxed to
 * "every public key". `neverSecretKeys()` is the wider set, and it sweeps in
 * the committed `scope: "default"` constants (`NEXT_PUBLIC_AVATARS_BUCKET`,
 * `GITHUB_ORG`) and the `scope: "developer"` ones (`DEV_VPN_HOST`, one
 * machine's IP). Pushing either gives a value that is already in the repo — or
 * that is meaningful on exactly one laptop — a second, per-environment home to
 * disagree with.
 *
 * ⚠️ `localStack: true` is deliberately NOT excluded. Five of these carry it
 * (`API_URL`, `PUBLISHABLE_KEY`, `REST_URL`, `S3_PROTOCOL_REGION`,
 * `STORAGE_S3_URL`), and it means "supplied by `supabase status` in
 * DEVELOPMENT, so absent from `.env` by design" — a statement about the local
 * stack and about `.env.example` rendering, not a claim that the value is
 * unnecessary once deployed. Staging and production have no local stack to
 * supply them; withholding them there points a deployed Worker at nothing.
 *
 * `minted` is excluded for the same fail-closed reason it is in
 * `storableKeys()`, and it excludes nothing today (the one minted key is a
 * secret) — which is exactly why it is written down rather than relied upon.
 */
export function variableKeys(): string[] {
  return keysWhere(
    (e) =>
      e.meta.scope === "environment" &&
      e.meta.secrecy === "public" &&
      e.meta.minted !== true,
  );
}

/**
 * Variables signed at deploy time, whose only copy lives on the deploy target.
 *
 * Consumed by `env push` (never uploaded) and by `env audit`, where
 * this set is what stops a Worker-only credential being reported — and then
 * pruned — as an orphan. See `EnvMeta.minted`.
 */
export function mintedKeys(): string[] {
  return keysWhere((e) => e.meta.minted === true);
}

/** Variables that must never be stored in Bitwarden or GitHub. */
export function neverStoreKeys(): string[] {
  return keysWhere((e) => e.meta.secrecy === "never-store");
}

/**
 * Variables that are not secrets and must not be pushed as ones.
 *
 * Wider than `variableKeys()` — it ignores scope — so it is the wrong set to
 * push FROM. What it is right for is the refusal: nothing here may become a
 * GitHub Actions secret, whatever its scope.
 */
export function neverSecretKeys(): string[] {
  return keysWhere((e) => e.meta.secrecy === "public");
}

/**
 * Variables that have a narrower credential for the non-deploy targets — the
 * ONLY keys such a target carries. See `EnvMeta.narrowed`.
 *
 * ⚠️ `every`, not `keysWhere()`'s `some`, and the difference is the direction
 * each fails in. Every other selector answers "is this key sensitive/routed",
 * where one manifest saying yes is the safe reading. This one answers "is this
 * key EXEMPT from the preflight exclusion", and an exemption granted because
 * one of two declarations mentions it fails OPEN: the key reaches a vault
 * project whose GitHub environment `main` can read. Duplicate declarations
 * cannot legally disagree anyway (the completeness test pins the whole meta),
 * so this costs nothing and closes the direction that matters.
 *
 * The length check is not decoration: `[].every(...)` is `true`, and a key
 * whose entry list somehow emptied would otherwise be marked narrowed.
 */
export function narrowedKeys(): string[] {
  return [...registry.entries()]
    .filter(
      ([, entries]) =>
        entries.length > 0 && entries.every((e) => e.meta.narrowed === true),
    )
    .map(([key]) => key)
    .sort();
}

/** Deployed secrets restricted to the `production-apply` GitHub environment. */
export function applyOnlyKeys(): string[] {
  return keysWhere((e) => e.meta.tier === "apply");
}

/**
 * Deployed secrets only the §3.5 plan jobs read: routed to `preflight` (via
 * their `narrowed` opt-in) and `production`, and EXCLUDED from `staging`,
 * where nothing reads them and a copy is one more credential to rotate.
 *
 * `keysWhere()`'s `some` is the right direction here for the same reason as
 * `applyOnlyKeys()`: one declaration calling a key plan-only excludes it from
 * an environment, and over-excluding fails closed (a starved job names the
 * missing key) where under-excluding parks an unread credential in staging.
 */
export function planOnlyKeys(): string[] {
  return keysWhere((e) => e.meta.tier === "plan");
}

/** Variables supplied by a running local Supabase stack. */
export function localStackKeys(): string[] {
  return keysWhere((e) => e.meta.localStack === true);
}

/**
 * Any entry matching is enough, deliberately.
 *
 * A key declared twice with disagreeing metadata is a bug, and the completeness
 * test is what catches it — but until it does, the safe reading of "one app
 * calls this a secret" is that it is a secret. Requiring every declaration to
 * agree would fail open in exactly the case that matters.
 */
function keysWhere(predicate: (entry: EnvEntry) => boolean): string[] {
  return [...registry.entries()]
    .filter(([, entries]) => entries.some(predicate))
    .map(([key]) => key)
    .sort();
}
