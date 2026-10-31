import type { Metadata } from "next";
import { Suspense } from "react";
import "~/components/Console/console.css";
import AppSideNav from "~/components/AppSideNav";
import { AppShell } from "~/ui/app-shell";
import RolesManager from "~/components/RolesManager";
import { CardSkeleton } from "~/components/Skeletons";
import UserRoleManager from "~/components/UserRoleManager";
import { getPermissionsPageData } from "~/server/loaders/permissions";
import { PageHeading, Panel } from "~/ui/app-shell";
import Callout from "~/ui/callout";

export const metadata: Metadata = {
  title: "Permissions | Console | DevDogs",
  robots: { index: false },
};

async function PermissionsData() {
  const {
    roles,
    callerMinRank,
    callerPermissions,
    discordSyncErrors,
    callerCapability,
  } = await getPermissionsPageData();

  return (
    <>
      {discordSyncErrors.length > 0 && (
        <Callout tone="warning" title="Discord sync issues">
          <ul className="list-inside list-disc">
            {discordSyncErrors.map((error, i) => (
              <li key={i}>{error}</li>
            ))}
          </ul>
        </Callout>
      )}

      <Panel
        id="assign-roles"
        title="Assign roles"
        help="Search for a member by name. You can give out and take away roles ranked below yours."
      >
        <UserRoleManager
          roles={roles}
          callerMinRank={callerMinRank}
          callerCapability={callerCapability}
        />
      </Panel>

      <Panel id="role-definitions" title="Role definitions">
        <RolesManager
          initialRoles={roles}
          callerMinRank={callerMinRank}
          callerPermissions={callerPermissions}
          callerCapability={callerCapability}
        />
      </Panel>
    </>
  );
}

export default function PermissionsPage() {
  return (
    <AppShell side={<AppSideNav />} className="con">
      <PageHeading
        title="Permissions"
        description="Every member starts with no permissions; President holds all of them and is assigned on Discord."
      />
      <Suspense
        fallback={
          <>
            <CardSkeleton rows={2} />
            <CardSkeleton rows={3} />
          </>
        }
      >
        <PermissionsData />
      </Suspense>
    </AppShell>
  );
}
