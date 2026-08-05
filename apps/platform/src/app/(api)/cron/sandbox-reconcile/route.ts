import { unauthorized } from "next/navigation";
import { NextResponse, connection } from "next/server";
import { env } from "~/env";
import {
  autoPausePass,
  expirePausedPass,
  reconcilePass,
} from "~/server/supabase/provision";

/**
 * GET /cron/sandbox-reconcile
 *
 * Nightly: project existence, status drift, 90-day pause expiry, auto-pause.
 *
 * **This route is the sole authority on orphaning.** The proxy must never
 * conclude a project is gone — a transient upstream error would otherwise tear
 * down a healthy environment's credentials and Vault secrets. Only a definite
 * 404 from `GET /v1/projects/{ref}` counts, and only here.
 *
 * The three passes run in order rather than in parallel, because each one's
 * input is the previous one's output: reconciling first means expiry sees
 * accurate statuses, and auto-pause last means it does not pause something the
 * reconcile just marked orphaned.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>`, skipped when running locally.
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

  try {
    const reconciled = await reconcilePass();
    const expired = await expirePausedPass();
    const paused = await autoPausePass();
    return NextResponse.json({ success: true, reconciled, expired, paused });
  } catch (e) {
    console.error(e);
    return new NextResponse("An unknown error occurred.", { status: 500 });
  }
}
