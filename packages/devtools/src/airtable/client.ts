import { AirtableClient, BASE_ID } from "@devdogsuga/airtable";
import { explain } from "../ui.js";

/**
 * The client every Airtable command shares, and the rule for WHICH token it
 * authenticates with.
 *
 * Deliberately NOT `apps/platform/src/server/airtable/credentials.ts`. That
 * path reads the token from Vault, which is right for the running platform and
 * wrong here: these commands run before the platform is configured, some of
 * them need `schema.bases:write` — a scope the sync token should not carry —
 * and they are run either by a person at a terminal who has the token in hand
 * or by a deploy job the workflow handed one to.
 *
 * So: environment only, and a loud failure rather than a fallback.
 *
 * ## The caller states a CAPABILITY, not a variable
 *
 * Which token a command reaches for is a property of what the command DOES:
 *
 *   need: "read"    AIRTABLE_PLAN_PAT, then AIRTABLE_SYNC_PAT
 *   need: "write"   AIRTABLE_APPLY_PAT, and nothing else
 *
 * ⚠️ **Prefer the narrower, and that ordering is the point.** `PLAN_PAT` holds
 * `schema.bases:read` alone, so a dry run authenticated with it is
 * structurally unable to write rather than merely uninterested in writing.
 * `SYNC_PAT` is behind it because it can read records too, which the schema
 * read does not need but `verify --duplicates` does.
 *
 * ⚠️ **The write row has ONE entry, and the empty second slot is deliberate.**
 * There is no operator token any more. `AIRTABLE_PAT` — the bootstrap
 * credential that used to sit at the end of both rows — was removed once
 * `deploy airtable-apply` existed: it carried `schema.bases:write` on a laptop
 * indefinitely, and every job it served is now either a read or the
 * reviewer-gated apply. A schema change therefore has exactly one path, and it
 * is the one with reviewers in front of it.
 *
 * ⚠️ **Neither row falls back across the split.** `AIRTABLE_PLAN_PAT` is absent
 * from the write row because it cannot do the job — falling back to it would
 * turn a missing apply credential into a 403 halfway through a schema change,
 * which is the worst of both outcomes. `AIRTABLE_APPLY_PAT` is absent from the
 * read row because it CAN do the job, and that is exactly the reason not to
 * use it: a plan that quietly ran on the write token would make the reviewer
 * gate in front of it decorative.
 *
 * ⚠️ **A brand-new base is the one thing this cannot do.** `POST /v0/meta/bases`
 * needs the workspace-creator role, which no scope grants, so creating a base
 * from nothing is a documented one-off: export `AIRTABLE_APPLY_PAT` locally for
 * that single `scaffold` run and revoke it after. See the runbook.
 *
 * ⚠️ **And never Vault.** The reasoning is above; the practical half is that a
 * `null` from a failed Vault read is indistinguishable from "nothing stored",
 * so a fallback there silently picks whichever token is broader.
 */

/** What the caller intends to do to the base. */
export type AirtableCapability = "read" | "write";

/**
 * The variables that can satisfy each capability, narrowest first.
 *
 * Exported because the failure message names them and the tests pin the
 * ordering: "prefers the narrower" is a claim about this array, and a claim
 * about an array is worth asserting against the array itself.
 */
export const CREDENTIAL_PREFERENCE: Record<
  AirtableCapability,
  readonly string[]
> = {
  read: ["AIRTABLE_PLAN_PAT", "AIRTABLE_SYNC_PAT"],
  write: ["AIRTABLE_APPLY_PAT"],
};

/** For the refusal text, so it says what the missing token would have to be. */
const SCOPES: Record<AirtableCapability, string> = {
  read: "schema.bases:read",
  write: "schema.bases:write",
};

/**
 * No usable credential for the requested capability.
 *
 * Its own class, with `detail` alongside `message`, because two very different
 * callers have to render it: the `airtable` group turns it into an `explain()`
 * box on stdout, and the `deploy` group turns it into a `DeployError` on
 * stderr (stdout there is machine-read — see `deploy/report.ts`). A thrown
 * `Error` with a formatted multi-line message would force one of them to
 * re-parse the other's layout.
 */
export class AirtableCredentialError extends Error {
  readonly detail: readonly string[];

  constructor(message: string, detail: readonly string[] = []) {
    super(message);
    this.name = "AirtableCredentialError";
    this.detail = detail;
  }
}

export interface AirtableCredentials {
  client: AirtableClient;
  baseId: string;
  /**
   * WHICH variable supplied the token.
   *
   * Reported rather than swallowed: the read row can resolve to
   * `AIRTABLE_PLAN_PAT`, which carries `schema.bases:read` ALONE, so a command
   * that then reads records gets a 403 that only makes sense once you know
   * which of two tokens was picked.
   */
  variable: string;
  need: AirtableCapability;
}

export interface AirtableCredentialOptions {
  need: AirtableCapability;
  /**
   * Injected so the tests can drive both rows and every fallback without
   * mutating the ambient environment of whatever else the runner has in the
   * same process — and, more to the point, without a real token being the
   * thing that decides which branch runs.
   */
  env?: NodeJS.ProcessEnv;
  /** Injected for the same reason `AirtableClient` takes one: no sockets in tests. */
  fetch?: typeof globalThis.fetch;
}

/**
 * Resolves the credential for a capability, or throws naming what it looked at.
 *
 * @throws {AirtableCredentialError} when none of the variables for `need`
 *   holds a value. The base id can no longer be missing — it is committed.
 */
export function resolveAirtableCredentials(
  options: AirtableCredentialOptions,
): AirtableCredentials {
  const { need, env = process.env, fetch } = options;
  const checked = CREDENTIAL_PREFERENCE[need];

  // The committed base unless something is deliberately pointing elsewhere.
  // This cannot fail any more: `BASE_ID` is a constant in the registry, beside
  // the field ids that belong to that same base, so there is no configuration
  // step between a checkout and knowing which base to talk to. `AIRTABLE_BASE_ID`
  // remains readable for a scratch base and is unset in every ordinary run.
  const baseId = env.AIRTABLE_BASE_ID || BASE_ID;

  // First non-empty wins, and the array order IS the preference. An empty
  // string counts as unset: a workflow that references a secret the
  // environment does not hold interpolates to "", and a client built on ""
  // would fail with a 401 from a vendor instead of naming the variable.
  const variable = checked.find((name) => (env[name] ?? "") !== "");
  if (!variable) {
    throw new AirtableCredentialError(
      `No Airtable token that can ${need} the base schema is set.`,
      [
        `Checked, in preference order: ${checked.join(", ")}.`,
        `The first of those to hold a value is used; each needs ${SCOPES[need]}.`,
        "",
        need === "read"
          ? "AIRTABLE_APPLY_PAT is NOT consulted here even though it would work."
          : "AIRTABLE_PLAN_PAT is NOT consulted here — it cannot write a schema.",
        need === "read"
          ? "A plan that ran on the write token would make the reviewer gate in"
          : "Falling back to it would turn this refusal into a 403 partway",
        need === "read"
          ? "front of that credential decorative."
          : "through a schema change.",
        "",
        ...(need === "write"
          ? [
              "There is no operator token to fall back to any more. A schema",
              "write happens in the reviewer-gated `deploy airtable-apply` job;",
              "if you are creating a base from nothing, that is the documented",
              "one-off in the runbook.",
              "",
            ]
          : []),
        "See docs/platform/guides/airtable/base-setup.md for the three tokens",
        "and their scopes.",
      ],
    );
  }

  return {
    client: new AirtableClient({
      baseId,
      token: env[variable]!,
      ...(fetch ? { fetch } : {}),
    }),
    baseId,
    variable,
    need,
  };
}

/**
 * The `airtable` group's wrapper: `explain()` and `null` instead of a throw.
 *
 * Kept because those four commands report through `@clack/prompts` and set an
 * exit code rather than propagating. The `deploy` group calls
 * `resolveAirtableCredentials` directly — it must not touch `explain`, which
 * writes to stdout.
 */
export function airtableClient(
  options: AirtableCredentialOptions,
): AirtableCredentials | null {
  try {
    return resolveAirtableCredentials(options);
  } catch (error) {
    if (!(error instanceof AirtableCredentialError)) throw error;
    explain(error.message, "", [...error.detail]);
    return null;
  }
}
