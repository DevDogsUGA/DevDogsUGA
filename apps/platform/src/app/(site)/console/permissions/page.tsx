import { Suspense } from "react";
import AccentBlobs from "~/ui/accent-blobs";
import { ConsoleCard } from "~/ui/card";
import PageHeader from "~/components/PageHeader";
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
        <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
          <p className="font-medium">Discord sync issues</p>
          <ul className="mt-1 list-inside list-disc text-amber-200/80">
            {discordSyncErrors.map((error, i) => (
              <li key={i}>{error}</li>
            ))}
          </ul>
        </div>
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
    <div className="relative isolate mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 @sm:px-6">
      <AccentBlobs accent="violet" />

      <PageHeader
        title="Permissions"
        description="Every member starts with no permissions; Root has all permissions and can only change hands via transfer below."
        accent="violet"
      />

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
    </div>
  );
}
