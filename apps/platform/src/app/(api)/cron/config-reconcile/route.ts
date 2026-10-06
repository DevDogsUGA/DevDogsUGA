import { getClubConfig, getQuestions } from "@devdogsuga/events";
import { unauthorized } from "next/navigation";
import { NextResponse, connection } from "next/server";
import { env } from "~/env";
import { db } from "~/server/db";
import { postAlert } from "~/server/alerts";
import { reconcileFromConfig } from "~/server/config/reconcile";
import { currentDeployment } from "~/server/deployment";
import { revalidateMeetings } from "~/server/loaders/meetings";

/**
 * GET /cron/config-reconcile
 *
 * Reconciles `meetings`, `workshops` and the survey's `surveyQuestions`
 * against `@devdogsuga/events`.
 * Fired on the shared fifteen-minute cron slot (see
 * `cloudflare/scheduled.ts`), and also by
 * `.github/workflows/deploy-app.yaml`'s "Reconcile meetings/workshops from
 * @devdogsuga/events" step (via `backstage deploy reconcile`,
 * an authenticated GET reading the JSON body rather than just the status --
 * `pnpm devtools cron run` alone would not have been enough) right after each deploy of THIS app -- deliberately not at
 * migrate time: `@devdogsuga/events`' config is bundled into the Worker at
 * build time, so a call before this deploy would reconcile the PREVIOUS
 * release's config. A promoted config therefore lands the moment THIS deploy
 * finishes, rather than waiting on the next fifteen-minute tick.
 *
 * `getClubConfig()` parses and validates the committed data file; a failure
 * there means the file itself is broken (wrong shape, or its content fails
 * `validateClubConfig`) and is reported the same way `reconcileFromConfig`
 * reports an in-memory config that fails ITS validation pass -- see that
 * function's header for why the two checks are not redundant. Both cases end
 * the same way here: nothing was written, and the alert already fired.
 *
 * Every response names the Worker that answered: `release` (the git SHA) and
 * `version` (Cloudflare's version id). The deploy step waits until `release`
 * is the commit it just deployed, so it never mistakes the previous Worker's
 * answer for its own. A run from a Worker older than the one that last
 * applied the config writes nothing and answers `skipped: "superseded"`, a
 * success: an old version still serving is expected mid-deploy, not an
 * error. When the reconcile changed something, the cached schedule and
 * homepage are expired so the change shows at once.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>`, skipped when running locally
 * -- the same convention every other cron route in this directory follows.
 */
export async function GET(request: Request) {
  await connection();

  if (
    process.env.DEPLOY_ENV &&
    process.env.DEPLOY_ENV !== "development" &&
    request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`
  ) {
    unauthorized();
  }

  const deployment = currentDeployment();
  const answeredBy = {
    release: deployment.release ?? null,
    version: deployment.version?.id ?? null,
  };

  let config;
  let questions;
  try {
    config = getClubConfig();
    questions = getQuestions();
  } catch (e) {
    // Broken at the file level (bad shape, or content the validator would
    // reject) -- CI's `check` step should have caught this before it ever
    // reached a deploy, so reaching here means that gate was bypassed or the
    // bundled file drifted from what CI approved. Reported the same way
    // `reconcileFromConfig` reports an in-memory validation failure, since
    // the operator-facing story is identical: nothing was written, go look
    // at the file.
    await postAlert(
      "Config reconcile aborted: committed config does not parse",
      [e instanceof Error ? e.message : String(e)],
      "`getClubConfig()` threw before reconcile ever ran. In the Backstage " +
        "repo, run `pnpm -F @devdogsuga/events check:events` to see " +
        "the same failure locally.",
    );
    return NextResponse.json({
      success: false,
      reason: "invalid_config_file",
      ...answeredBy,
    });
  }

  try {
    const result = await reconcileFromConfig(
      db,
      config,
      questions,
      deployment.version,
    );
    if (!result.ok) {
      if ("appliedBy" in result) {
        return NextResponse.json({
          success: true,
          skipped: "superseded",
          appliedBy: result.appliedBy.id,
          ...answeredBy,
        });
      }
      return NextResponse.json({
        success: false,
        reason: result.reason,
        ...answeredBy,
      });
    }
    if (result.changed) revalidateMeetings();
    return NextResponse.json({
      success: true,
      counts: result.counts,
      changed: result.changed,
      ...answeredBy,
    });
  } catch (e) {
    console.error(e);
    return new NextResponse("An unknown error occurred.", { status: 500 });
  }
}
