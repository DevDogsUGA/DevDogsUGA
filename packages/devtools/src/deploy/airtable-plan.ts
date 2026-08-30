/**
 * `pnpm devtools deploy airtable-plan`
 *
 * The Airtable half of the §3.5 dry runs: what would this commit do to the
 * officers' base, written to `$GITHUB_STEP_SUMMARY` next to the migration plan.
 *
 * ## Why this file exists separately from `airtable-apply.ts`
 *
 * "It only reads" is a claim, and a claim in a comment is worth nothing on the
 * job that runs from `main`. So the claim is structural instead: this module
 * imports `planScaffold` and calls `getBaseSchema()`, and there is no path from
 * here to `scaffoldBase`. The function that creates tables and fields is not in
 * this module's import list at all. Splitting the two commands across two files
 * is what makes that inspectable rather than argued.
 *
 * The credential is the second half of the same argument.
 * `resolveAirtableCredentials` is asked for `need: "read"`, which consults
 * `AIRTABLE_PLAN_PAT` first and never consults `AIRTABLE_APPLY_PAT` at all. See
 * `../airtable/client.ts` for why preferring the narrower token is the point
 * rather than a nicety. The plan token carries `schema.bases:read` on one base
 * and was probed against the live base: a records read and a schema write both
 * answered 403.
 *
 * ⚠️ **No `secrets.X != ''` guard belongs in the workflow step that runs this.**
 * The old Airtable job passed for months without ever running because of one,
 * and a step that silently no-ops is worse than no step. This command REFUSES,
 * by name, when the credential is missing; that refusal is the whole value.
 *
 * ## Everything human goes to stderr
 *
 * Like every command under `deploy/`, this reports through `say()` rather than
 * `@clack/prompts`, which writes exclusively to stdout. See `deploy/report.ts`.
 *
 * ## Interface
 *
 *   AIRTABLE_BASE_ID=… AIRTABLE_PLAN_PAT=… pnpm devtools deploy airtable-plan
 *
 * Writes the plan to `$GITHUB_STEP_SUMMARY`, and `changed=true|false` to
 * `$GITHUB_OUTPUT` so the apply job can be asked for an approval only when
 * there is something to approve. That is the shape `production-plan` already
 * uses for `config.toml`. It needs no env FILE, only the two variables the
 * workflow hands it, so it runs through `cli:no-env`.
 */
import { appendFileSync } from "node:fs";
import { planScaffold, type ScaffoldPlan } from "@devdogsuga/airtable";
import {
  AirtableCredentialError,
  resolveAirtableCredentials,
} from "../airtable/client.js";
import { DeployError, say, summary } from "./report.js";

/**
 * Everything that touches the outside world, injected. The same arrangement
 * `preflight.ts` uses, for the same reason: the decision that must not rot is
 * unreachable in a test that has to open a socket.
 *
 * `fetch` reaches `AirtableClient`, so a test can assert the METHOD of every
 * request this command makes. "Cannot mutate" is then a property the suite
 * measures rather than one the header asserts.
 */
export interface DeployAirtableDeps {
  env?: NodeJS.ProcessEnv;
  fetch?: typeof globalThis.fetch;
  /** Where the human-readable lines go. Defaults to `say()`, on stderr. */
  report?: (lines: readonly string[]) => void;
}

export interface AirtablePlanVerdict {
  /** True when the base is missing a table or a field the registry declares. */
  changed: boolean;
  plan: readonly ScaffoldPlan[];
}

/**
 * One plan entry as a line, matching what `airtable scaffold --dry-run` prints.
 *
 * Deliberately the same text in both places. A contributor who runs the dry run
 * on a laptop and then reads the job summary should be comparing two outputs,
 * not translating between two formats.
 */
export function renderPlan(plan: readonly ScaffoldPlan[]): string[] {
  return plan.map((entry) => {
    if (!entry.exists) {
      return `+ table ${entry.table} (${String(entry.declared)} fields)`;
    }
    if (entry.missing.length === 0) return `  ${entry.table} — up to date`;
    return [
      `  ${entry.table} — ${String(entry.missing.length)} field(s) to add`,
      ...entry.missing.map((f) => `    + ${f.name} (${f.type})`),
    ].join("\n");
  });
}

/**
 * Reads the live base and reports what a scaffold would create.
 *
 * @throws {DeployError} when no read credential is available, or when the
 *   schema read fails. Both are hard failures: a plan that could not be
 *   computed must not read as "nothing to do".
 */
export async function runDeployAirtablePlan(
  deps: DeployAirtableDeps = {},
): Promise<AirtablePlanVerdict> {
  const { env = process.env, fetch, report = say } = deps;

  let credentials;
  try {
    credentials = resolveAirtableCredentials({ need: "read", env, fetch });
  } catch (error) {
    // Translated rather than rethrown: `cli.ts` renders `DeployError`'s
    // two-part shape to stderr, and this group has no other reporting path.
    if (!(error instanceof AirtableCredentialError)) throw error;
    throw new DeployError(error.message, error.detail);
  }

  const { client, baseId, variable } = credentials;
  report([`airtable-plan: reading ${baseId} with ${variable}`]);

  const { tables } = await client.getBaseSchema();
  const plan = planScaffold(tables);
  const changed = plan.some(
    (entry) => !entry.exists || entry.missing.length > 0,
  );

  const lines = renderPlan(plan);
  const heading = changed
    ? "### Airtable schema plan — changes pending"
    : "### Airtable schema plan — up to date";

  summary(
    [
      heading,
      "",
      `Base \`${baseId}\`, ${String(tables.length)} live table(s), read with a`,
      "`schema.bases:read` token. Nothing was written.",
      "",
      "```",
      ...lines,
      "```",
      "",
    ],
    env,
  );

  // Echoed to the log as well as the summary tab, for the reason `preflight`
  // gives: the job log is where somebody looks first.
  report([heading.replace(/^#+ /, ""), ...lines]);

  // The gate for the apply job, so the reviewer approval is asked for when
  // there is something to approve rather than on every promotion. Written even
  // when false: an absent output reads as false to the workflow anyway, and an
  // explicit one shows in the log which way it went.
  const path = env.GITHUB_OUTPUT;
  if (path) appendFileSync(path, `changed=${String(changed)}\n`);
  report([`airtable-plan: changed=${String(changed)}`]);

  return { changed, plan };
}
