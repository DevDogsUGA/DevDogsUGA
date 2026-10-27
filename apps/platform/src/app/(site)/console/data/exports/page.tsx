import type { Metadata } from "next";
import {
  EXPORTS,
  FORMATS_BY_KIND,
  formatFor,
} from "@devdogsuga/events/exports";
import ConsoleShell from "~/components/Console/ConsoleShell";
import ExportsWorkspace, {
  type FormatOptions,
} from "~/components/Exports/ExportsWorkspace";
import { CONSOLE_EXPORT_KINDS } from "~/lib/exports";
import { formatEventShortDate } from "~/lib/eventTime";
import { canUserManageAttendance } from "~/server/actions/permissions";
import { requirePermission } from "~/server/auth/require";
import { listImportableMeetings } from "~/server/imports/deps";
import { PageHeading } from "~/ui/app-shell";

export const metadata: Metadata = {
  title: "Exports | Console | DevDogs",
  robots: { index: false },
};

const formats = Object.fromEntries(
  CONSOLE_EXPORT_KINDS.map((kind) => [
    kind,
    FORMATS_BY_KIND[kind].map((name) => {
      const f = formatFor(name, EXPORTS[kind].columns);
      return { name, label: f.label, hint: f.hint, perEvent: f.perEvent };
    }),
  ]),
) as FormatOptions;

/**
 * Attendance, reflections and check-in survey answers, as the CSVs and lists
 * `backstage export` writes. Each export is recorded in the audit log under
 * the signed-in officer before a row is read. The EL evidence export replaces
 * the stars export later; it is not here.
 */
export default async function ExportsPage() {
  await requirePermission(canUserManageAttendance);
  // Exports keep the CLI's reach (Q76): any past meeting, not only the
  // newest 80 the import picker lists.
  const meetings = await listImportableMeetings(new Date(), 1000);
  return (
    <ConsoleShell current="/console/data/exports">
      <PageHeading
        title="Exports"
        description="Choose a dataset and format, check the counts and who was left out, then download. These files hold member details: keep them to the work that needs them."
        crumbs={[
          { label: "Data tools", href: "/console/data" },
          { label: "Exports" },
        ]}
      />
      <ExportsWorkspace
        meetings={meetings.map((m) => ({
          id: m.id,
          label: `${formatEventShortDate(m.startsAt)} · ${m.title}`,
        }))}
        formats={formats}
      />
    </ConsoleShell>
  );
}
