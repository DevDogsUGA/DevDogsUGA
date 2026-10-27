import { and, eq, sql } from "drizzle-orm";
import { db } from "~/server/db";
import { auditEvents, oauthRegistrations } from "~/server/db/schema";
import { oauthAuditEvent } from "./audit";
import type { OAuthStatus } from "./status";

/**
 * The domain steps behind the holder-only status actions
 * (`~/server/actions/oauthStatus.ts`). They never check who is asking: the
 * `"use server"` module does that first, because every export of such a module
 * is a callable endpoint and these are not.
 */

export const APP_NOT_FOUND = "OAuth client not found";

export type RevokeScope = "everyone_but_owner" | "test_identities" | "user";

export interface RevokeCounts {
  consents: number;
  sessions: number;
  authorizations: number;
}

/** Anything that can run a statement: the database or a transaction on it. */
type Executor = Pick<typeof db, "execute">;

/**
 * The kill switch (oauth-consent Q156): one SQL function, used by every caller,
 * that revokes consents, deletes the app's sessions (their refresh tokens go
 * with them) and deletes pending authorizations, in the caller's transaction.
 * `scope` says who it reaches; see `platform.oauth_revoke_app_access`.
 */
export async function revokeAppAccess(
  executor: Executor,
  clientId: string,
  scope: RevokeScope,
  userId?: string,
): Promise<RevokeCounts> {
  const rows = await executor.execute<{ counts: RevokeCounts }>(sql`
    select platform.oauth_revoke_app_access(
      ${clientId}::uuid, ${scope}, ${userId ?? null}::uuid
    ) as counts
  `);
  const counts = rows[0]?.counts;
  if (!counts) throw new Error("The kill switch returned nothing");
  return counts;
}

async function requireRegistration(clientId: string) {
  const registration = await db.query.oauthRegistrations.findFirst({
    columns: {
      clientId: true,
      userId: true,
      label: true,
      status: true,
      asksForConsent: true,
      logoPath: true,
      homepageUrl: true,
      privacyPolicyUrl: true,
    },
    where: { clientId },
  });
  if (!registration) throw new Error(APP_NOT_FOUND);
  return registration;
}

/** What publishing still needs, by name; empty when the app may be published. */
export function missingForPublishing(app: {
  logoPath: string | null;
  homepageUrl: string | null;
  privacyPolicyUrl: string | null;
}): string[] {
  const missing: string[] = [];
  if (!app.logoPath) missing.push("a logo");
  if (!app.homepageUrl) missing.push("a homepage");
  if (!app.privacyPolicyUrl) missing.push("a privacy policy");
  return missing;
}

/**
 * Publishes an app or returns it to Testing, runs the kill switch for the
 * side that loses access, and records the change with the counts, all in one
 * transaction.
 *
 * - To Testing: everyone but the owner and the owner's test accounts is cut off
 *   (everyone, for a DevDogs app). The consent switch is turned back on,
 *   because only an In production DevDogs app may skip it.
 * - To In production: needs a logo, a homepage and a privacy policy (Q159).
 *   Test accounts lose their sessions and approvals (Q164).
 */
export async function setAppStatus(input: {
  actorUserId: string;
  clientId: string;
  status: OAuthStatus;
}): Promise<{ changed: boolean; counts: RevokeCounts | null }> {
  const app = await requireRegistration(input.clientId);
  if (app.status === input.status) return { changed: false, counts: null };

  if (input.status === "in_production") {
    const missing = missingForPublishing(app);
    if (missing.length > 0) {
      throw new Error(`Before publishing, add ${missing.join(", ")}`);
    }
  }

  const counts = await db.transaction(async (tx) => {
    await tx
      .update(oauthRegistrations)
      .set(
        input.status === "testing"
          ? { status: "testing", asksForConsent: true }
          : { status: "in_production" },
      )
      .where(eq(oauthRegistrations.clientId, input.clientId));

    const revoked = await revokeAppAccess(
      tx,
      input.clientId,
      input.status === "testing" ? "everyone_but_owner" : "test_identities",
    );
    await tx.insert(auditEvents).values(
      oauthAuditEvent({
        actorUserId: input.actorUserId,
        action:
          input.status === "testing"
            ? "oauth_app.returned_to_testing"
            : "oauth_app.published",
        clientId: input.clientId,
        metadata: {
          label: app.label,
          ownerUserId: app.userId,
          ...revoked,
        },
      }),
    );
    return revoked;
  });
  return { changed: true, counts };
}

/**
 * Turns the consent screen off or on. Only an ownerless In production app may
 * skip it (Q162); the database check says the same, and this gives the reason.
 */
export async function setAsksForConsent(input: {
  actorUserId: string;
  clientId: string;
  asksForConsent: boolean;
}): Promise<{ changed: boolean }> {
  const app = await requireRegistration(input.clientId);
  if (app.asksForConsent === input.asksForConsent) return { changed: false };

  if (!input.asksForConsent) {
    if (app.userId !== null) {
      throw new Error("Only a DevDogs app can skip the consent screen");
    }
    if (app.status !== "in_production") {
      throw new Error(
        "An app must be In production to skip the consent screen",
      );
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(oauthRegistrations)
      .set({ asksForConsent: input.asksForConsent })
      .where(eq(oauthRegistrations.clientId, input.clientId));
    await tx.insert(auditEvents).values(
      oauthAuditEvent({
        actorUserId: input.actorUserId,
        action: "oauth_app.consent_changed",
        clientId: input.clientId,
        metadata: {
          label: app.label,
          asksForConsent: input.asksForConsent,
        },
      }),
    );
  });
  return { changed: true };
}

/**
 * Makes an app a DevDogs app: one-way, it nulls the owner (Q161). The former
 * owner's slot is freed (DevDogs apps do not count towards the cap), and the
 * app is no longer deleted with their account.
 */
export async function transferToDevDogs(input: {
  actorUserId: string;
  clientId: string;
}): Promise<{ changed: boolean }> {
  const app = await requireRegistration(input.clientId);
  if (app.userId === null) return { changed: false };

  await db.transaction(async (tx) => {
    await tx
      .update(oauthRegistrations)
      .set({ userId: null })
      .where(
        and(
          eq(oauthRegistrations.clientId, input.clientId),
          eq(oauthRegistrations.userId, app.userId!),
        ),
      );
    await tx.insert(auditEvents).values(
      oauthAuditEvent({
        actorUserId: input.actorUserId,
        action: "oauth_app.transferred_to_devdogs",
        clientId: input.clientId,
        metadata: { label: app.label, formerOwnerUserId: app.userId },
      }),
    );
  });
  return { changed: true };
}

/**
 * Forgets one member's approval of an app and ends their sessions with it
 * (Forget approval and Remove access, Q158). Audited with the counts.
 */
export async function forgetApproval(input: {
  actorUserId: string;
  clientId: string;
  userId: string;
}): Promise<RevokeCounts> {
  const app = await requireRegistration(input.clientId);
  return db.transaction(async (tx) => {
    const counts = await revokeAppAccess(
      tx,
      input.clientId,
      "user",
      input.userId,
    );
    await tx.insert(auditEvents).values(
      oauthAuditEvent({
        actorUserId: input.actorUserId,
        action: "oauth_app.approval_forgotten",
        clientId: input.clientId,
        metadata: { label: app.label, userId: input.userId, ...counts },
      }),
    );
    return counts;
  });
}
