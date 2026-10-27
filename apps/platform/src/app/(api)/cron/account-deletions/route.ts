import { NextResponse, connection } from "next/server";
import { runDueDeletions } from "~/server/accountDeletion/job";
import { authorizeCron } from "~/server/moderation/cronAuth";

/**
 * GET /cron/account-deletions
 *
 * Deletes every account whose fourteen-day window has ended (account-deletion
 * Q4): the block row for a moderated member, their OAuth apps, the schedule
 * builder's tables, `user.delete` to every registered app, the auth user, one
 * `user.deleted` audit entry and the completion email.
 *
 * A deletion that fails at any step stays pending and the next run starts it
 * again. The response is a 500 while any is stuck, so the cron dispatcher
 * (and with it the Worker's monitor) records it instead of reporting success.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>`, skipped when running locally.
 */
export async function GET(request: Request) {
  await connection();
  authorizeCron(request);

  const run = await runDueDeletions();
  return NextResponse.json(
    {
      success: run.failed.length === 0,
      completed: run.completed.length,
      // Ids and errors, no names or addresses.
      failed: run.failed,
    },
    { status: run.failed.length === 0 ? 200 : 500 },
  );
}
