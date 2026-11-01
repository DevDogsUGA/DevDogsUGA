import type { Metadata } from "next";
import {
  DownloadSimpleIcon,
  UploadSimpleIcon,
} from "@phosphor-icons/react/ssr";
import ConsoleShell from "~/components/Console/ConsoleShell";
import { canUserManageAttendance } from "~/server/auth/permissions";
import { requirePermission } from "~/server/auth/require";
import { PageHeading, Panel } from "~/ui/app-shell";
import LinkButton from "~/ui/link-button";
import { ListRow } from "~/ui/list-row";

export const metadata: Metadata = {
  title: "Data tools | Console | DevDogs",
  robots: { index: false },
};

/**
 * The home of the console's member-data tools (Q72): imports and exports.
 * Everything on it needs `canManageAttendance` and nothing else (Q16).
 */
export default async function DataToolsPage() {
  await requirePermission(canUserManageAttendance);
  return (
    <ConsoleShell current="/console/data">
      <PageHeading
        title="Data tools"
        description="Bring attendance sheets and the Involvement roster into the platform, and take attendance, reflections and survey answers out. Imports are previewed first; every import and export is recorded in the audit log."
      />
      <Panel title="Imports">
        <ListRow
          variant="account"
          icon={<UploadSimpleIcon />}
          title="Import attendance or the roster"
          description="Upload a CSV, check the columns and the preview, then confirm."
          end={
            <LinkButton
              href="/console/data/imports"
              variant="outline"
              size="sm"
            >
              Open
            </LinkButton>
          }
        />
      </Panel>
      <Panel title="Exports">
        <ListRow
          variant="account"
          icon={<DownloadSimpleIcon />}
          title="Export attendance, reflections or survey answers"
          description="Pick a dataset, a format and a range, check the counts and who was left out, then download."
          end={
            <LinkButton
              href="/console/data/exports"
              variant="outline"
              size="sm"
            >
              Open
            </LinkButton>
          }
        />
      </Panel>
    </ConsoleShell>
  );
}
