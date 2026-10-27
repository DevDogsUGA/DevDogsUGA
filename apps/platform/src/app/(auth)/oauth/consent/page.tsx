import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import * as z from "zod";
import type { TestAccount } from "~/server/actions/testAccounts";
import { expectSession, expectUserWith } from "~/server/auth";
import ConsentActions from "~/components/ConsentCard/ConsentActions";
import ConsentCard, { ConsentRefusedCard } from "~/components/ConsentCard";
import ConsentForm from "~/components/ConsentForm";
import { env } from "~/env";
import { testAccountName } from "~/lib/testAccountName";
import { approveAs } from "~/server/oauth/asAccount";
import { approveAuthorization } from "~/server/oauth/approveAuthorization";
import {
  loadConsentRequest,
  resolveConsentAccount,
} from "~/server/oauth/consentRequest";
import {
  logoUrl,
  returnHost,
  sharedFields,
} from "~/server/oauth/consentScreen";
import {
  findConsentTarget,
  findDisplayName,
  hasActiveConsent,
} from "~/server/oauth/consentTarget";
import { createSupabaseServerClient } from "~/supabase/server";

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
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Whether the browser is only prefetching this URL (a `<Link>` in view, a
 * speculation rule). Covers the browser's own `Sec-Purpose`/`Purpose` headers
 * and the router's prefetch headers where the runtime passes them through to
 * `headers()`; vinext reads `Next-Router-Prefetch` itself and may not, so
 * this is best effort. Nothing links to this route, and the real protection is
 * that every approval needs a POST (a Server Action) except the remembered
 * case. A prefetch must never start or finish a flow: approving
 * on a GET the member did not make would hand a code to the app unseen.
 */
async function isPrefetch(): Promise<boolean> {
  const h = await headers();
  return (
    h.get("next-router-prefetch") !== null ||
    h.get("next-router-segment-prefetch") !== null ||
    h.get("x-middleware-prefetch") !== null ||
    /prefetch/i.test(h.get("purpose") ?? "") ||
    /prefetch/i.test(h.get("sec-purpose") ?? "")
  );
}

function single(value: string | string[] | undefined): string | null {
  return typeof value === "string" && value ? value : null;
}

export default async function ConsentPage({ searchParams }: Props) {
  const params = await searchParams;
  const authorizationId = single(params.authorization_id);

  if (!authorizationId) {
    notFound();
  }

  if (await isPrefetch()) {
    return null;
  }

  // An unknown id, a stale id and an unregistered client are a 404 before
  // anyone is asked to sign in, so they look the same from outside.
  if (!(await findConsentTarget(authorizationId))) {
    notFound();
  }

  const userId = await expectSession().catch(() => {
    const callbackPath = `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
    redirect(`/auth?callbackPath=${encodeURIComponent(callbackPath)}`);
  });

  // The client's registration decides everything: an unregistered client or a
  // gone authorization is a 404 for everyone. The access token hook downgrades
  // every token this authorization produces to `oauth_identity`, because
  // GoTrue's own consent endpoint does not go through this page.
  const request = await loadConsentRequest(authorizationId, userId);
  if (!request || request.decision === "not-found") {
    notFound();
  }
  const { target, decision } = request;

  if (decision === "test-identity") {
    return <ConsentRefusedCard authorizationId={authorizationId} />;
  }

  if (decision === "auto-approve") {
    let destination: string;
    try {
      destination = await approveAuthorization(
        await createSupabaseServerClient(),
        authorizationId,
      );
    } catch {
      // An expired or already-used authorization: same answer as a stale id.
      notFound();
    }
    redirect(destination);
  }

  // `consent` (In production) is always the member themselves. `pick-account`
  // (Testing, the owner) is the account named in the address, re-checked here
  // against the owner's own accounts; no valid pick shows the picker.
  const picked = z.uuid().safeParse(single(params.accountId));
  const account = await resolveConsentAccount(
    request,
    decision === "consent" ? null : picked.success ? picked.data : null,
  );

  if (!account) {
    return pickerStep(authorizationId, request, userId);
  }

  // Approvals are Supabase Auth's. An account that already approved this app
  // goes straight back; the card is for the first sign-in.
  if (await hasActiveConsent(account.userId, target.clientId, target.scope)) {
    let destination: string;
    try {
      destination = await approveAs(account.actor, authorizationId);
    } catch {
      notFound();
    }
    redirect(destination);
  }

  const host = returnHost(target.redirectUri);
  if (!host) {
    notFound();
  }

  const registrant = target.ownerUserId
    ? ((await findDisplayName(target.ownerUserId)) ?? "a DevDogs member")
    : null;

  return (
    <ConsentCard
      app={{
        label: target.label,
        logoSrc: logoUrl(target.logoPath, {
          baseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
          bucket: env.NEXT_PUBLIC_AVATARS_BUCKET,
        }),
        homepageUrl: target.homepageUrl,
        privacyPolicyUrl: target.privacyPolicyUrl,
        registrant,
      }}
      account={{ name: account.name, email: account.email }}
      fields={sharedFields(target.scope)}
      host={host}
      authorizationId={authorizationId}
      testing={decision === "pick-account"}
    >
      <ConsentActions
        authorizationId={authorizationId}
        accountId={decision === "pick-account" ? account.userId : undefined}
      />
    </ConsentCard>
  );
}

/** Step one on a Testing app: the owner picks themselves or a test account. */
async function pickerStep(
  authorizationId: string,
  request: NonNullable<Awaited<ReturnType<typeof loadConsentRequest>>>,
  userId: string,
) {
  const self = await resolveConsentAccount(request, userId);
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
  }).catch(() => notFound());

  const testAccounts = user.testAccounts.map(
    ({ user, createdAt }) =>
      ({
        userId: user.id,
        displayName: testAccountName(user.rawUserMetaData),
        createdAt: createdAt.toISOString(),
      }) satisfies TestAccount,
  );

  // The centring and the full-viewport ground come from `(auth)/layout.tsx`.
  return (
    <div className="card w-full max-w-md" style={{ padding: 32 }}>
      <ConsentForm
        authorizationId={authorizationId}
        self={{
          userId,
          displayName: self?.name ?? user.email ?? "You",
        }}
        testAccounts={testAccounts}
      />
    </div>
  );
}
