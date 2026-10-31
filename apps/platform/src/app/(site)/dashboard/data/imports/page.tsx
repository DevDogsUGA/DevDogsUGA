import { rules, requireAccess } from "~/server/auth/access";
import type { Metadata } from "next";
import "~/components/Console/console.css";
import ImportsWorkspace from "~/components/Imports/ImportsWorkspace";
import { formatEventShortDate } from "~/lib/eventTime";

import { listImportableMeetings } from "~/server/imports/deps";
import { PageHeading } from "~/ui/app-shell";

export const metadata: Metadata = {
  title: "Imports | Console | DevDogs",
  robots: { index: false },
};

const single = (v: string | string[] | undefined) =>
  typeof v === "string" ? v : undefined;

/**
 * Attendance sheets and the Involvement roster, from CSV. The upload is read
 * on the server with the same parsers as `backstage import` and never stored;
 * what changes is shown first and written only after a confirmation. Meeting
 * pages link here with `?kind=attendance&meeting=<id>`.
 */
export default async function ImportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    kind?: string | string[];
    meeting?: string | string[];
  }>;
}) {
  await requireAccess(rules.manageAttendance);
  const params = await searchParams;
  const meetings = await listImportableMeetings();
  const wanted = single(params.meeting);

  return (
    <div className="con">
      <PageHeading
        title="Imports"
        description="Upload a CSV, check the columns and the preview, then confirm. Uploading changes nothing by itself, and the file is not kept."
        crumbs={[
          { label: "Data tools", href: "/dashboard/data" },
          { label: "Imports" },
        ]}
      />
      <ImportsWorkspace
        meetings={meetings.map((m) => ({
          id: m.id,
          label: `${formatEventShortDate(m.startsAt)} · ${m.title}`,
        }))}
        initialKind={single(params.kind) === "roster" ? "roster" : "attendance"}
        initialMeetingId={
          wanted && meetings.some((m) => m.id === wanted) ? wanted : null
        }
      />
    </div>
  );
}
