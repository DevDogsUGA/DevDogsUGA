import { rules, requireAccess } from "~/server/auth/access";
import type { Metadata } from "next";
import Link from "next/link";
import ConsoleFrame from "~/classic/components/Console/ConsoleFrame";
import PageShell from "~/classic/components/PageShell";
import { ConsoleCard } from "~/classic/ui/card";

export const metadata: Metadata = {
  title: "Data tools | Console | DevDogs",
  robots: { index: false },
};

const LINK_ROW =
  "flex flex-wrap items-center justify-between gap-4 rounded-sm outline-none transition hover:text-cyan-300 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-mauve-950";

/**
 * The home of the console's member-data tools (Q72): imports and exports.
 * Everything on it needs `canManageAttendance` and nothing else (Q16).
 */
export default async function DataToolsPage() {
  await requireAccess(rules.manageAttendance);
  return (
    <ConsoleFrame>
      <PageShell
        accent="cyan"
        title="Data tools"
        description="Bring attendance sheets and the Involvement roster into the platform, and take attendance, reflections and survey answers out. Imports are previewed first; every import and export is recorded in the audit log."
      >
        <ConsoleCard.Root id="imports">
          <ConsoleCard.Header title="Imports" />
          <ConsoleCard.Content>
            <Link href="/dashboard/data/imports" className={LINK_ROW}>
              <span>
                <span className="font-semibold text-white">
                  Import attendance or the roster
                </span>
                <span className="mt-1 block text-sm text-mauve-400">
                  Upload a CSV, check the columns and the preview, then confirm.
                </span>
              </span>
              <span className="text-sm font-medium text-cyan-300">Open →</span>
            </Link>
          </ConsoleCard.Content>
        </ConsoleCard.Root>
        <ConsoleCard.Root id="exports">
          <ConsoleCard.Header title="Exports" />
          <ConsoleCard.Content>
            <Link href="/dashboard/data/exports" className={LINK_ROW}>
              <span>
                <span className="font-semibold text-white">
                  Export attendance, reflections or survey answers
                </span>
                <span className="mt-1 block text-sm text-mauve-400">
                  Pick a dataset, a format and a range, check the counts and who
                  was left out, then download.
                </span>
              </span>
              <span className="text-sm font-medium text-cyan-300">Open →</span>
            </Link>
          </ConsoleCard.Content>
        </ConsoleCard.Root>
      </PageShell>
    </ConsoleFrame>
  );
}
