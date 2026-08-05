import { redirect } from "next/navigation";
import { connection } from "next/server";
import AirtableSyncPanel from "~/components/AirtableSyncPanel";
import ConsolePageShell from "~/components/ConsolePageShell";
import {
  getAirtableSyncState,
  requestAirtableSync,
} from "~/server/actions/airtable";
import { canUserTriggerSync } from "~/server/actions/permissions";
import { expectSession } from "~/server/auth";

/**
 * /console/airtable
 *
 * Airtable is the CMS for meetings, workshops and competitions, and the sync
 * polls it every fifteen minutes. This page exists for the other case: an
 * officer who fixed a requirement count ten minutes before judging should not
 * have to wait, and neither should anyone working out why a refusal fired.
 *
 * The same trigger is also reachable from an Airtable **button field** on the
 * Meetings table, which is the one that matters in practice — it puts the
 * control in the surface where the edit was just made. Both go through
 * `requestAirtableSync`; this page is the one with room to explain itself.
 */
export default async function AirtableConsolePage() {
  // Nothing here may be prerendered: "last run 3 minutes ago" is the whole
  // point, and a cached page would report a pass that has since happened.
  await connection();

  const callerId = await expectSession().catch(() => redirect("/auth"));
  if (!(await canUserTriggerSync(callerId))) redirect("/");

  const state = await getAirtableSyncState();

  return (
    <ConsolePageShell
      accent="blue"
      title="Airtable Sync"
      description="Pull officer edits out of Airtable and push derived values back. Runs every 15 minutes on its own."
    >
      <AirtableSyncPanel initial={state} runSync={requestAirtableSync} />

      <section className="rounded-sm border-2 border-black bg-white p-4 text-sm">
        <h2 className="font-semibold">What the sync will not do</h2>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 opacity-80">
          <li>
            Change a workshop&apos;s meeting or project once anybody has
            attended it — that would move credit people already earned.
          </li>
          <li>
            Change a finalized competition&apos;s requirement count, because
            every team&apos;s score is computed against that number.
          </li>
          <li>
            Move <code>Judging starts</code> once participation has frozen, in
            either direction.
          </li>
          <li>
            Delete anything. A row deleted in Airtable is archived here, and its
            attendance survives.
          </li>
        </ul>
        <p className="mt-3 opacity-70">
          Each refusal is also written into that record&apos;s{" "}
          <code>Sync status</code> field, so the officer who made the edit sees
          it where they made it.
        </p>
      </section>
    </ConsolePageShell>
  );
}
