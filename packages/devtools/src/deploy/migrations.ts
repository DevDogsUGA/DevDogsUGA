/**
 * `pnpm devtools-ci deploy plan` and `deploy migrate`.
 *
 * The two halves of a production schema change, behind the same tested seam as
 * the rest of the deploy group. They replace the raw `supabase db push` shell
 * that used to live in four places in `deploy.yaml` — `--dry-run` piped to
 * `$GITHUB_STEP_SUMMARY` for the plan, `--yes` for the apply. The load-bearing
 * `set -o pipefail` there (so a failed connection did not read as a clean plan)
 * was a shell idiom no test could reach; here it is `dbPushDryRun`'s
 * throw-on-non-zero, which a test drives.
 *
 * Both read `DB_URL` from the step's own `env:` (the plan under the
 * migration_planner role that `require-planner` guards, the apply under the
 * deploy-tier credential), compose no env file, and run through the bare `ci`
 * package script — the one-credential convention shared with `require-planner`
 * and `require-token`. Dependencies are injected (env, the push runner) rather
 * than reached for, so the tests exercise the argv, the refusals, the summary
 * framing, and the failed-connection invariant without a database.
 */
import { dbPush, dbPushDryRun } from "../db/run.js";
import { DeployError, say, summary } from "./report.js";

const MISSING_DB_URL = [
  "This step runs with the environment's DB_URL. An empty value usually",
  "means the environment secret was never pushed, or the workflow step",
  "lost its env: block.",
];

/**
 * Dry-run the migrations and write the plan to the job summary.
 *
 * The plan text is captured, not streamed, so `dbPushDryRun`'s throw on a
 * non-zero exit is what fails the step when the connection is dead — and the
 * job summary then carries no plan, which is the honest outcome. `label` lets
 * the caller distinguish the two stages (`main`'s early plan vs the one taken
 * seconds before the apply); it is the only thing that varies between them.
 */
export async function runDeployPlan(
  label: string = "Migration plan",
  env: NodeJS.ProcessEnv = process.env,
  plan: (dbUrl: string) => Promise<string> = dbPushDryRun,
): Promise<void> {
  const url = env.DB_URL;
  if (!url) {
    throw new DeployError(
      "DB_URL is not set — refusing to plan.",
      MISSING_DB_URL,
    );
  }
  const text = await plan(url);
  // Echoed to stderr as well as the summary, so the plan is visible in the live
  // job log too — stdout belongs to the machine for this group (see report.ts).
  say([text]);
  summary([`### ${label}`, "", "```", text, "```"], env);
}

/**
 * Apply the migrations to DB_URL.
 *
 * `dbPush(url, { yes: true })` — the bare push, WITHOUT the type regeneration
 * the contributor path layers on, so a production apply never writes back into
 * the checkout. A non-zero exit becomes a DeployError so the job fails with a
 * line a person can read; the supabase CLI's own output (inherited stdio) says
 * why above it.
 */
export async function runDeployMigrate(
  env: NodeJS.ProcessEnv = process.env,
  push: (dbUrl: string) => Promise<number> = (url) =>
    dbPush(url, { yes: true }),
): Promise<void> {
  const url = env.DB_URL;
  if (!url) {
    throw new DeployError(
      "DB_URL is not set — refusing to migrate.",
      MISSING_DB_URL,
    );
  }
  const code = await push(url);
  if (code !== 0) {
    throw new DeployError(`\`supabase db push\` failed (exit ${code}).`, [
      "The migration was not applied. The supabase CLI output above says why.",
    ]);
  }
  say(["deploy migrate: migrations applied."]);
}
