import { Suspense } from "react";
import AccentBlobs from "~/ui/accent-blobs";
import CreateCredentialDialog from "~/components/Credentials/CreateCredentialDialog";
import CredentialsList from "~/components/Credentials/CredentialsList";
import PageHeader from "~/components/PageHeader";
import { TableSkeleton } from "~/components/Skeletons";
import { getCredentialsPageData } from "~/server/loaders/credentials";

async function CredentialsData() {
  const { credentials, canCreate, allRoles } = await getCredentialsPageData();

  return (
    <>
      {canCreate && (
        <div className="flex justify-end -mt-4">
          <CreateCredentialDialog allRoles={allRoles} />
        </div>
      )}
      <CredentialsList credentials={credentials} canCreate={canCreate} />
    </>
  );
}

export default function CredentialsPage() {
  return (
    <div className="relative isolate mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 @sm:px-6">
      <AccentBlobs accent="rose" />

      <PageHeader
        title="Credentials"
        description="Shared accounts and secrets used for testing integrations, visible only to roles you grant access to."
        accent="rose"
      />

      <Suspense fallback={<TableSkeleton />}>
        <CredentialsData />
      </Suspense>
    </div>
  );
}
