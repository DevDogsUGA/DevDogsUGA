import { notFound, redirect } from "next/navigation";
import { approveAuthorization } from "~/server/actions/consent";
import type { TestAccount } from "~/server/actions/testAccounts";
import { expectSession, expectUserWith } from "~/server/auth";
import { db } from "~/server/db";
import { createSupabaseServerClient } from "~/supabase/server";
import ConsentForm from "~/components/ConsentForm";

interface Props {
  searchParams: Promise<Record<string, string>>;
}

export default async function ConsentPage({ searchParams }: Props) {
  const authorizationId = (await searchParams).authorization_id;

  if (!authorizationId) {
    notFound();
  }

  const oauthRegistration = await db.query.oauthRegistrations.findFirst({
    where: { authorizations: { authorizationId } },
  });

  if (!oauthRegistration) {
    notFound();
  }
  // Production clients (or clients not in our DB) are auto-approved with the
  // real user's identity — no interaction needed.
  if (oauthRegistration.type === "production") {
    await expectSession().catch(() => {
      const callbackPath = `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
      redirect(`/api/auth?callbackPath=${encodeURIComponent(callbackPath)}`);
    });

    return await approveAuthorization(
      await createSupabaseServerClient(),
      authorizationId,
    );
  }

  // Ensure the user is signed in.
  const user = await expectUserWith({
    testAccounts: {
      columns: {
        createdAt: true,
      },
      with: {
        user: {
          columns: {
            id: true,
            email: true,
            createdAt: true,
            rawUserMetaData: true,
          },
        },
      },
    },
    oauthRegistration: {
      where: {
        authorizations: { authorizationId },
      },
    },
  }).catch(() => {
    const callbackPath = `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
    redirect(`/api/auth?callbackPath=${encodeURIComponent(callbackPath)}`);
  });

  const testAccounts = user.testAccounts.map(
    ({ user, createdAt }) =>
      ({
        userId: user.id,
        displayName:
          user.rawUserMetaData &&
          typeof user.rawUserMetaData === "object" &&
          "display_name" in user.rawUserMetaData &&
          typeof user.rawUserMetaData.display_name === "string"
            ? user.rawUserMetaData.display_name
            : "Test User",
        createdAt: createdAt.toISOString(),
      }) satisfies TestAccount,
  );

  return (
    <ConsentLayout>
      <ConsentForm
        authorizationId={authorizationId}
        testAccounts={testAccounts}
      />
    </ConsentLayout>
  );
}

function ConsentLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="bg-dot-grid flex min-h-dvh flex-col items-center justify-center px-4">
      <div className="shadow-block w-full max-w-sm border border-black bg-white p-8">
        {children}
      </div>
    </main>
  );
}
