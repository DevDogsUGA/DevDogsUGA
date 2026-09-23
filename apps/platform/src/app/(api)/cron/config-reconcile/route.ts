import { getClubConfig } from "@devdogsuga/club-config";
import { unauthorized } from "next/navigation";
import { NextResponse, connection } from "next/server";
import { env } from "~/env";
import { db } from "~/server/db";
import { postAlert } from "~/server/alerts";
import { reconcileFromConfig } from "~/server/config/reconcile";

/**
 * GET /cron/config-reconcile
 *
 * Reconciles `meetings` and `workshops` against `@devdogsuga/club-config`.
 * Fired on the shared fifteen-minute cron slot (see
 * `cloudflare/scheduled.ts`). `pnpm devtools cron run` can also target this
 * route directly with an authenticated GET, which is how a deploy pipeline's
 * post-migrate step would call it -- but no such step exists yet in
 * `.github/workflows/deploy.yaml`, so a promoted config currently waits on
 * the next fifteen-minute tick rather than landing the moment the deploy
 * finishes.
 *
 * `getClubConfig()` parses and validates the committed data file; a failure
 * there means the file itself is broken (wrong shape, or its content fails
 * `validateClubConfig`) and is reported the same way `reconcileFromConfig`
 * reports an in-memory config that fails ITS validation pass -- see that
 * function's header for why the two checks are not redundant. Both cases end
 * the same way here: nothing was written, and the alert already fired.
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

  let config;
  try {
    config = getClubConfig();
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
      "`getClubConfig()` threw before reconcile ever ran. Run " +
        "`pnpm --filter @devdogsuga/club-config check` to see the same " +
        "failure locally.",
    );
    return NextResponse.json({ success: false, reason: "invalid_config_file" });
  }

  try {
    const result = await reconcileFromConfig(db, config);
    if (!result.ok) {
      return NextResponse.json({ success: false, reason: result.reason });
    }
    return NextResponse.json({ success: true, counts: result.counts });
  } catch (e) {
    console.error(e);
    return new NextResponse("An unknown error occurred.", { status: 500 });
  }
}
