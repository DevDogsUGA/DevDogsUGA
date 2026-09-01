/**
 * `pnpm devtools deploy airtable-apply`
 *
 * The mutation the §3.5 plan precedes: create whatever the registry declares
 * and the officers' base does not have. Runs in the `production-apply` GitHub
 * environment, behind required reviewers.
 *
 * ## Why it is a separate file from `airtable-plan.ts`
 *
 * So that the plan's "it cannot mutate" is a property of the module graph
 * rather than a sentence. `scaffoldBase` is imported HERE and nowhere near the
 * plan; the plan's own header explains the other half.
 *
 * ## Why it needs its own approval at all, when the plan just ran
 *
 * `scaffoldBase` creates tables and fields in a base officers use every day,
 * and Airtable has no undo for a schema change made by a token. The plan
 * seconds earlier is what makes the approval reviewable; the approval is what
 * makes the plan worth printing. §3.5 pairs them deliberately.
 *
 * ⚠️ Idempotent, and that is load-bearing rather than incidental: the job that
 * runs this is gated on the plan reporting `changed=true`, and a re-run after a
 * partial failure must not double-create. `scaffoldBase` creates only what the
 * live schema lacks, re-reading the base afterwards rather than trusting its
 * own accumulated view.
 *
 * ## Interface
 *
 *   AIRTABLE_BASE_ID=… AIRTABLE_APPLY_PAT=… pnpm devtools deploy airtable-apply
 *
 * Uses a `write` client: `AIRTABLE_APPLY_PAT` first, `AIRTABLE_PAT` as the
 * operator fallback, and never `AIRTABLE_PLAN_PAT`. Falling back to a token
 * that cannot write would turn a missing credential into a 403 halfway through
 * a schema change.
 */
import { discoverIds, scaffoldBase } from "@devdogsuga/airtable";
import {
  AirtableCredentialError,
  resolveAirtableCredentials,
} from "../airtable/client.js";
import { DeployError, say, summary } from "./report.js";
// Type-only, so nothing about the plan module is imported at run time:
// `verbatimModuleSyntax` erases the line entirely. The two commands share one
// dependency shape because a test that drives one should drive the other the
// same way.
import type { DeployAirtableDeps } from "./airtable-plan.js";

export interface AirtableApplyResult {
  tables: number;
  fields: number;
}

/**
 * Applies the schema the registry declares.
 *
 * @throws {DeployError} when no write credential is available, or when the
 *   base still lacks something the registry declares after the run. That means
 *   Airtable refused a field, and a green apply there would be a lie the next
 *   sync discovers.
 */
export async function runDeployAirtableApply(
  deps: DeployAirtableDeps = {},
): Promise<AirtableApplyResult> {
  const { env = process.env, fetch, report = say } = deps;

  let credentials;
  try {
    credentials = resolveAirtableCredentials({ need: "write", env, fetch });
  } catch (error) {
    if (!(error instanceof AirtableCredentialError)) throw error;
    throw new DeployError(error.message, error.detail);
  }

  const { client, baseId, variable } = credentials;
  report([`airtable-apply: scaffolding ${baseId} with ${variable}`]);

  const result = await scaffoldBase(client, {
    // `say()`, not `log.message`; see `deploy/report.ts`. Each created table
    // and field is named as it happens, because a failure halfway through
    // leaves the base partly changed and the log is the only record of how far
    // it got.
    log: (message) => {
      report([`  ${message}`]);
    },
  });

  const tables = result.created.filter((c) => c.kind === "table").length;
  const fields = result.created.filter((c) => c.kind === "field").length;

  const found = discoverIds(result.schema);
  if (found.missing.length > 0) {
    // Reported to the summary as well as thrown: this is the failure somebody
    // has to act on in Airtable, and the job log is not where they will look
    // for it a day later.
    summary(
      [
        "### Airtable schema apply — INCOMPLETE",
        "",
        `Created ${String(tables)} table(s) and ${String(fields)} field(s) in`,
        `\`${baseId}\`, and the base still lacks:`,
        "",
        "```",
        ...found.missing,
        "```",
        "",
      ],
      env,
    );
    throw new DeployError(
      "The base still lacks tables or fields the registry declares.",
      [
        ...found.missing.map((m) => `  ${m}`),
        "",
        "Airtable refused something, or the scaffolder has a bug. Do NOT run",
        "`airtable apply` against this base — it would write a registry that",
        "is half real ids and half placeholders, which looks finished.",
      ],
    );
  }

  summary(
    [
      "### Airtable schema apply",
      "",
      `Created ${String(tables)} table(s) and ${String(fields)} field(s) in`,
      `\`${baseId}\`. Every table and field the registry declares now exists.`,
      "",
    ],
    env,
  );
  report([
    `airtable-apply: created ${String(tables)} table(s) and ${String(fields)} field(s).`,
  ]);

  return { tables, fields };
}
