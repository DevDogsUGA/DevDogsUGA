import { Suspense } from "react";
import CreateCredentialDialog from "~/components/Credentials/CreateCredentialDialog";
import CredentialsList from "~/components/Credentials/CredentialsList";
import PageShell from "~/components/PageShell";
import { TableSkeleton } from "~/components/Skeletons";
import { getCredentialsPageData } from "~/server/loaders/credentials";

/**
 * The create button, resolved apart from the list.
 *
 * It belongs in the header's row, but whether it exists at all depends on
 * `canCreate`, which is a permission read this page deliberately streams. Its
 * own Suspense boundary keeps the title instant instead of holding the whole
 * page on a permission check, and `getCredentialsPageData` is `cache`d, so the
 * two boundaries share one read rather than doubling it.
 */
async function CreateCredentialAction() {
  const { canCreate, allRoles } = await getCredentialsPageData();
  if (!canCreate) return null;

  return <CreateCredentialDialog allRoles={allRoles} />;
}

async function CredentialsData() {
  const { credentials, canCreate } = await getCredentialsPageData();

  return <CredentialsList credentials={credentials} canCreate={canCreate} />;
}

export default function CredentialsPage() {
  return (
    <PageShell
      accent="rose"
      title="Credentials"
      description="Shared accounts and secrets used for testing integrations, visible only to roles you grant access to."
      actions={
        <Suspense fallback={null}>
          <CreateCredentialAction />
        </Suspense>
      }
    >
      <Suspense fallback={<TableSkeleton />}>
        <CredentialsData />
      </Suspense>
    </PageShell>
  );
}
