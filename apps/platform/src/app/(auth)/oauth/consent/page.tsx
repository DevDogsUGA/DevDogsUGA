import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { approveAuthorization } from "~/server/actions/consent";
import type { TestAccount } from "~/server/actions/testAccounts";
import { expectSession, expectUserWith } from "~/server/auth";
import { db } from "~/server/db";
import { createSupabaseServerClient } from "~/supabase/server";
import ConsentForm from "~/components/ConsentForm";

/**
 * A step inside an authorization flow, reachable only with a live
 * `authorization_id`. Without one it 404s, and with a stale one it 404s too.
 * Nothing here is the same twice, let alone worth indexing, and the query
 * string it needs is a credential-adjacent identifier that should not end up in
 * a search result.
 */
export const metadata: Metadata = {
  title: "Authorize | DevDogs",
  robots: { index: false },
};

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
  // Production clients are auto-approved with the real user's identity, with no
  // interaction.
  if (oauthRegistration.type === "production") {
    await expectSession().catch(() => {
      const callbackPath = `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
      redirect(`/auth?callbackPath=${encodeURIComponent(callbackPath)}`);
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
    redirect(`/auth?callbackPath=${encodeURIComponent(callbackPath)}`);
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

  // The centring and the full-viewport ground come from `(auth)/layout.tsx`.
  // All that is left here is the card the decision sits on.
  return (
    <div className="w-full max-w-sm rounded-xl border-2 border-mauve-800 bg-mauve-900 p-8 shadow-lg shadow-black/30">
      <ConsentForm
        authorizationId={authorizationId}
        testAccounts={testAccounts}
      />
    </div>
  );
}
