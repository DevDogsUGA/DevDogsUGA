import { connection } from "next/server";
import { ConsoleCard } from "~/ui/card";
import AirtableSyncPanel from "~/components/AirtableSyncPanel";
import PageShell from "~/components/PageShell";
import {
  getAirtableSyncState,
  requestAirtableSync,
} from "~/server/actions/airtable";
import { canUserTriggerSync } from "~/server/actions/permissions";
import { requirePermission } from "~/server/auth/require";

/**
 * /console/airtable
 *
 * Airtable is the CMS for meetings, workshops and competitions, and the sync
 * polls it every fifteen minutes. This page exists for the other case: an
 * officer who fixed a requirement count ten minutes before judging should not
 * have to wait, and neither should anyone working out why a refusal fired.
 *
 * The same trigger is also reachable from an Airtable button field on the
 * Meetings table, which puts the control where the edit was just made. Both go
 * through `requestAirtableSync`; this page is the one with room to explain
 * itself.
 */
export default async function AirtableConsolePage() {
  // Nothing here may be prerendered: "last run 3 minutes ago" is the whole
  // point, and a cached page would report a pass that has since happened.
  await connection();

  await requirePermission(canUserTriggerSync);

  const state = await getAirtableSyncState();

  return (
    <PageShell
      accent="blue"
      title="Airtable Sync"
      description="Pull officer edits out of Airtable and push derived values back. Runs every 15 minutes on its own."
    >
      <AirtableSyncPanel initial={state} runSync={requestAirtableSync} />

      <ConsoleCard.Root id="what-the-sync-will-not-do">
        <ConsoleCard.Header title="What the sync will not do" />
        <ConsoleCard.Content>
          <div className="flex flex-col gap-3 text-sm">
            <ul className="flex list-disc flex-col gap-1 pl-5 text-mauve-300">
              <li>
                Change a workshop&apos;s meeting or project once anybody has
                attended it — that would move credit people already earned.
              </li>
              <li>
                Change a finalized competition&apos;s requirement count, because
                every team&apos;s score is computed against that number.
              </li>
              <li>
                Move{" "}
                <code className="rounded-sm bg-white/10 px-1 py-0.5 font-mono text-xs text-mauve-200">
                  Judging starts
                </code>{" "}
                once participation has frozen, in either direction.
              </li>
              <li>
                Delete anything. A row deleted in Airtable is archived here, and
                its attendance survives.
              </li>
            </ul>
            <p className="text-mauve-400">
              Each refusal is also written into that record&apos;s{" "}
              <code className="rounded-sm bg-white/10 px-1 py-0.5 font-mono text-xs text-mauve-200">
                Sync status
              </code>{" "}
              field, so the officer who made the edit sees it where they made
              it.
            </p>
          </div>
        </ConsoleCard.Content>
      </ConsoleCard.Root>
    </PageShell>
  );
}
