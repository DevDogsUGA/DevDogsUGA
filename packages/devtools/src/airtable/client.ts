import { AirtableClient } from "@devdogsuga/airtable";
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
 * There are three Airtable tokens now (docs/platform/airtable-setup.md lists
 * them with their scopes), and which one a command should reach for is a
 * property of what the command DOES:
 *
 *   need: "read"    AIRTABLE_PLAN_PAT, then AIRTABLE_PAT
 *   need: "write"   AIRTABLE_APPLY_PAT, then AIRTABLE_PAT
 *
 * ⚠️ **Prefer the narrower, and that ordering is the point.** An operator at a
 * terminal usually holds the full `AIRTABLE_PAT`, which satisfies both rows —
 * so an unordered lookup would authenticate every dry run with a token that
 * can restructure the base. Reading with a read-only token when one is present
 * is what makes `scaffold --dry-run` structurally unable to write rather than
 * merely uninterested in writing.
 *
 * ⚠️ **Neither row falls back across the split.** `AIRTABLE_PLAN_PAT` is absent
 * from the write row because it cannot do the job — falling back to it would
 * turn a missing apply credential into a 403 halfway through a schema change,
 * which is the worst of both outcomes. `AIRTABLE_APPLY_PAT` is absent from the
 * read row because it CAN do the job, and that is exactly the reason not to
 * use it: a plan that quietly ran on the write token would make the reviewer
 * gate in front of it decorative.
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
  read: ["AIRTABLE_PLAN_PAT", "AIRTABLE_PAT"],
  write: ["AIRTABLE_APPLY_PAT", "AIRTABLE_PAT"],
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
 * @throws {AirtableCredentialError} when `AIRTABLE_BASE_ID` is unset, or when
 *   none of the variables for `need` holds a value.
 */
export function resolveAirtableCredentials(
  options: AirtableCredentialOptions,
): AirtableCredentials {
  const { need, env = process.env, fetch } = options;
  const checked = CREDENTIAL_PREFERENCE[need];

  const baseId = env.AIRTABLE_BASE_ID;
  if (!baseId) {
    throw new AirtableCredentialError(
      "AIRTABLE_BASE_ID is not set — there is no base to talk to.",
      [
        "It is the `appXXXXXXXXXXXXXX` id, public rather than secret, and it",
        "is declared in apps/platform/env.ts. In a deploy job it arrives as a",
        "GitHub environment VARIABLE; on a laptop it belongs in the root .env.",
        "",
        "See docs/platform/airtable-setup.md.",
      ],
    );
  }

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
        "See docs/platform/airtable-setup.md for the three tokens and their",
        "scopes.",
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
