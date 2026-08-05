"use server";

import { expectSession } from "~/server/auth";
import { readSyncState, type SyncStateSnapshot } from "~/server/airtable/lease";
import { runAirtableSync, type SyncReport } from "~/server/airtable/run";
import { canUserTriggerSync } from "~/server/actions/permissions";

/**
 * The officer console's two Airtable actions.
 *
 * `requestAirtableSync` is the same implementation the cron runs — see
 * `server/airtable/run.ts`. Gated on `canTriggerSync`, which is also what the
 * `/airtable/sync` route checks, because that route is reachable from a
 * button field inside Airtable and an Airtable button is not an authenticated
 * caller by itself.
 */

export async function requestAirtableSync(): Promise<SyncReport> {
  const callerId = await expectSession();
  if (!(await canUserTriggerSync(callerId))) {
    throw new Error("Not authorized: canTriggerSync required");
  }

  return runAirtableSync({ trigger: "manual", triggeredBy: callerId });
}

/**
 * The last pass's outcome, without triggering one.
 *
 * Separate from the trigger so the console can render "last run 3 minutes ago,
 * 2 rows refused" on load. Same permission: `lastError` can quote an Airtable
 * payload, and the refusal detail names rows a member has no business seeing.
 */
export async function getAirtableSyncState(): Promise<SyncStateSnapshot | null> {
  const callerId = await expectSession();
  if (!(await canUserTriggerSync(callerId))) {
    throw new Error("Not authorized: canTriggerSync required");
  }

  return readSyncState();
}
