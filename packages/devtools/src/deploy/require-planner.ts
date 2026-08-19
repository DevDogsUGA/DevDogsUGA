/**
 * `pnpm devtools deploy require-planner`
 *
 * Refuses the §3.5 stage-1 dry run when its `DB_URL` is anything more than
 * the `migration_planner` role.
 *
 * The preflight credential is the one narrowed value NOTHING can verify at
 * rest: a full-access connection string pasted into `.env.preflight` works
 * identically — the dry run succeeds, `env push` uploads it cleanly, and
 * `env audit` reports no drift forever, because the stored value matches the
 * file it came from. The only place the difference is observable is a live
 * connection, so this guard runs one: it must authenticate as the planner,
 * it must FAIL to read `platform.profile`, and it must succeed in reading the
 * migrations table the dry run is about to plan against. See
 * `planner/checks.ts` for the three checks; `planner create` runs the same
 * ones, so a credential that passed at minting time passes here.
 *
 * Runs in the `main-plan` job only. `production-plan` runs the same dry run
 * with the PRODUCTION environment's `DB_URL`, which is the full connection
 * string by design — apps boot from it — so this guard would (correctly)
 * refuse there. The narrowing is a property of the preflight tier, not of the
 * dry run.
 *
 * Like the rest of the group: `cli:no-env` (the job holds one credential in
 * the step's `env:` block and composes no file), reports through `say()`
 * (stderr), refuses by `DeployError`. One line per check on success — this
 * runs as its own step, and three green lines are the evidence the §3.5
 * argument leans on.
 */
import { checkPlanner } from "../planner/checks.js";
import { connectDb, type Connect } from "../planner/db.js";
import { DeployError, say } from "./report.js";

export async function runRequirePlanner(
  env: Record<string, string | undefined> = process.env,
  connect: Connect = connectDb,
): Promise<void> {
  const url = env.DB_URL;
  if (!url) {
    throw new DeployError("DB_URL is not set — refusing to plan.", [
      "This step runs with the preflight environment's DB_URL: the",
      "migration_planner role, pushed by `env push --target preflight`.",
      "An empty value usually means the environment secret was never",
      "pushed, or the workflow step lost its env: block.",
    ]);
  }

  const db = connect(url);
  try {
    const verdict = await checkPlanner(db);
    for (const line of verdict.lines) say([`require-planner: ${line}`]);
    if (!verdict.ok) {
      throw new DeployError(`refusing to plan: ${verdict.problem}`, [
        "The preflight DB_URL must be the migration_planner role and no",
        "more — this environment is reachable from `main`. Mint or repair",
        "it with `pnpm devtools planner create` (or `planner status` to",
        "see what is wrong), then `env push --target preflight`.",
      ]);
    }
  } finally {
    await db.end();
  }
}
