import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import type { TestAccount } from "~/server/actions/testAccounts";
import { expectUserWith } from "~/server/auth";
import { db } from "~/server/db";
import ConsentForm from "~/components/ConsentForm";
import { testAccountName } from "~/lib/testAccountName";

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
    oauthRegistrations: {
      where: {
        authorizations: { authorizationId },
      },
    },
  }).catch(() => {
    const callbackPath = `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
    redirect(`/auth?callbackPath=${encodeURIComponent(callbackPath)}`);
  });

  // Sign in with DevDogs is a local-development tool: only the member who
  // registered the client can approve it, and only as themselves or one of
  // their test accounts. Everyone else gets the same 404 as a stale id. The
  // access token hook (migration 50) enforces the same rule on every token,
  // since GoTrue's own consent endpoint does not go through this page.
  if (!user.oauthRegistrations[0]) {
    notFound();
  }

  const testAccounts = user.testAccounts.map(
    ({ user, createdAt }) =>
      ({
        userId: user.id,
        displayName: testAccountName(user.rawUserMetaData),
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
