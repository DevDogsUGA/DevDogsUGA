import type { Metadata } from "next";
import { UploadSimpleIcon } from "@phosphor-icons/react/ssr";
import ConsoleShell from "~/components/Console/ConsoleShell";
import { canUserManageAttendance } from "~/server/actions/permissions";
import { requirePermission } from "~/server/auth/require";
import { PageHeading, Panel } from "~/ui/app-shell";
import LinkButton from "~/ui/link-button";
import { ListRow } from "~/ui/list-row";

export const metadata: Metadata = {
  title: "Data tools | Console | DevDogs",
  robots: { index: false },
};

/**
 * The home of the console's member-data tools (Q72). Imports live here now;
 * exports join them in the next stage. Everything on it needs
 * `canManageAttendance` and nothing else (Q16).
 */
export default async function DataToolsPage() {
  await requirePermission(canUserManageAttendance);
  return (
    <ConsoleShell current="/console/data">
      <PageHeading
        title="Data tools"
        description="Bring attendance sheets and the Involvement roster into the platform. Every import is previewed first and recorded in the audit log."
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
    </ConsoleShell>
  );
}
