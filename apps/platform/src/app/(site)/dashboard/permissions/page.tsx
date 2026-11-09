import type { Metadata } from "next";
import { Suspense } from "react";
import ConsoleFrame from "~/classic/components/Console/ConsoleFrame";
import Callout from "~/classic/ui/callout";
import { ConsoleCard } from "~/classic/ui/card";
import PageShell from "~/classic/components/PageShell";
import RolesManager from "~/classic/components/RolesManager";
import { CardSkeleton } from "~/classic/components/Skeletons";
import UserRoleManager from "~/classic/components/UserRoleManager";
import { getPermissionsPageData } from "~/server/loaders/permissions";

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

      <ConsoleCard.Root id="assign-roles">
        <ConsoleCard.Header title="Assign Roles" />
        <ConsoleCard.Content>
          <UserRoleManager
            roles={roles}
            callerMinRank={callerMinRank}
            callerCapability={callerCapability}
          />
        </ConsoleCard.Content>
      </ConsoleCard.Root>

      <ConsoleCard.Root id="role-definitions">
        <ConsoleCard.Header title="Role Definitions" />
        <ConsoleCard.Content>
          <RolesManager
            initialRoles={roles}
            callerMinRank={callerMinRank}
            callerPermissions={callerPermissions}
            callerCapability={callerCapability}
          />
        </ConsoleCard.Content>
      </ConsoleCard.Root>
    </>
  );
}

export default function PermissionsPage() {
  return (
    <ConsoleFrame>
      <PageShell
        accent="violet"
        title="Permissions"
        description="Every member starts with no permissions; President holds all of them and is assigned on Discord."
      >
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
      </PageShell>
    </ConsoleFrame>
  );
}
