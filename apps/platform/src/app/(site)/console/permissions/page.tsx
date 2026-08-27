import { Suspense } from "react";
import Callout from "~/ui/callout";
import { ConsoleCard } from "~/ui/card";
import PageShell from "~/components/PageShell";
import RolesManager from "~/components/RolesManager";
import RootAccessCard from "~/components/RootAccessCard";
import { CardSkeleton } from "~/components/Skeletons";
import UserRoleManager from "~/components/UserRoleManager";
import { getPermissionsPageData } from "~/server/loaders/permissions";

async function PermissionsData() {
  const {
    roles,
    callerMinRank,
    callerPermissions,
    rootHolder,
    isRootHolder,
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

      <ConsoleCard.Root id="root-access">
        <ConsoleCard.Header title="Root Access" />
        <ConsoleCard.Content>
          <RootAccessCard rootHolder={rootHolder} isRootHolder={isRootHolder} />
        </ConsoleCard.Content>
      </ConsoleCard.Root>

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
    <PageShell
      accent="violet"
      title="Permissions"
      description="Every member starts with no permissions; Root has all permissions and can only change hands via transfer below."
    >
      <Suspense
        fallback={
          <>
            <CardSkeleton rows={1} />
            <CardSkeleton rows={2} />
            <CardSkeleton rows={3} />
          </>
        }
      >
        <PermissionsData />
      </Suspense>
    </PageShell>
  );
}
