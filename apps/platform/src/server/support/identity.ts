import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, eq, isNull, notInArray, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { env } from "~/env";
import { expectSession } from "~/server/auth";
import { db } from "~/server/db";
import {
  profiles,
  supportConversations,
  supportGuests,
  supportMessages,
} from "~/server/db/schema";
import { identitiesInAuth } from "~/supabase/drizzle/schema";
import { GUEST_RETENTION_DAYS } from "./config";

/**
 * Who is talking to the widget.
 *
 * Members are signed in with a DevDogs profile. Guests are NOT Supabase users
 * -- no anonymous sign-ins -- but a random token in an httpOnly cookie, scoped
 * to the support routes and matched against its hash in
 * `platform.supportGuests`. Keeping guests out of `auth.users` keeps them out
 * of every RLS policy granted to `authenticated` and every `requireSession`
 * call, none of which were written with a guest in mind.
 */
export type Visitor =
  | {
      kind: "member";
      userId: string;
      name: string;
      discord: { id: string; avatarUrl: string | null } | null;
    }
  | { kind: "guest"; guestId: string; label: string };

export const GUEST_COOKIE = "devdogs_support_guest";
const COOKIE_PATH = "/support";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** The visitor's name as it appears in Discord. */
export function displayName(visitor: Visitor): string {
  return visitor.kind === "member"
    ? `${visitor.name} (via docs)`
    : `${visitor.label} (via docs)`;
}

/** The visitor's ownership columns, for inserts and where clauses. */
export function owner(visitor: Visitor): {
  userId: string | null;
  guestId: string | null;
} {
  return visitor.kind === "member"
    ? { userId: visitor.userId, guestId: null }
    : { userId: null, guestId: visitor.guestId };
}

async function currentMember(): Promise<Extract<
  Visitor,
  { kind: "member" }
> | null> {
  const userId = await expectSession().catch(() => null);
  if (!userId) return null;

  const [[profile], [identity]] = await Promise.all([
    db
      .select({ name: profiles.preferredName })
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .limit(1),
    db
      .select({
        id: identitiesInAuth.providerId,
        data: identitiesInAuth.identityData,
      })
      .from(identitiesInAuth)
      .where(
        and(
          eq(identitiesInAuth.userId, userId),
          eq(identitiesInAuth.provider, "discord"),
        ),
      )
      .limit(1),
  ]);
  // A session without a profile is an account that never finished signing
  // up; the rest of the site treats it as signed out, and so does this.
  if (!profile) return null;

  const avatar = (identity?.data as { avatar_url?: unknown } | undefined)
    ?.avatar_url;

  return {
    kind: "member",
    userId,
    name: profile.name,
    discord: identity
      ? {
          id: identity.id,
          avatarUrl: typeof avatar === "string" ? avatar : null,
        }
      : null,
  };
}

async function currentGuest(): Promise<Extract<
  Visitor,
  { kind: "guest" }
> | null> {
  const token = (await cookies()).get(GUEST_COOKIE)?.value;
  if (!token) return null;

  const [guest] = await db
    .update(supportGuests)
    .set({ lastSeenAt: sql`now()` })
    .where(
      and(
        eq(supportGuests.tokenHash, hashToken(token)),
        isNull(supportGuests.blockedAt),
      ),
    )
    .returning({ id: supportGuests.id, label: supportGuests.label });
  return guest
    ? { kind: "guest", guestId: guest.id, label: guest.label }
    : null;
}

/**
 * The current visitor, or null for someone who has not asked anything yet.
 *
 * A member who still carries a guest cookie (they asked as a guest, then
 * signed in) has the guest's conversations moved onto their account here,
 * on whichever support request comes first after sign-in. That is the whole
 * claim flow: no callback hook, no separate endpoint.
 */
export async function currentVisitor(): Promise<Visitor | null> {
  // Both at once: most visitors have one or the other, and the guest lookup
  // costs nothing without its cookie.
  const [member, guest] = await Promise.all([currentMember(), currentGuest()]);
  if (!member) return guest;

  if (guest) {
    await claimGuest(guest.guestId, member.userId);
    (await cookies()).delete({ name: GUEST_COOKIE, path: COOKIE_PATH });
  }
  return member;
}

async function claimGuest(guestId: string, userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    // A thread the member is already in (they followed it while signed in,
    // too) keeps the member's row; the guest's duplicate goes with the guest.
    const existing = await tx
      .select({ threadId: supportConversations.threadId })
      .from(supportConversations)
      .where(eq(supportConversations.userId, userId));
    const taken = existing.map((row) => row.threadId);

    await tx
      .update(supportConversations)
      .set({ userId, guestId: null })
      .where(
        and(
          eq(supportConversations.guestId, guestId),
          taken.length > 0
            ? notInArray(supportConversations.threadId, taken)
            : undefined,
        ),
      );
    await tx
      .update(supportMessages)
      .set({ userId, guestId: null })
      .where(eq(supportMessages.guestId, guestId));
    // Cascades whatever conversation rows were left behind as duplicates.
    await tx.delete(supportGuests).where(eq(supportGuests.id, guestId));
  });
}

/**
 * Mints a guest. Only after Turnstile has passed (see `verifyTurnstile`);
 * this function trusts its caller on that.
 */
export async function createGuest(): Promise<
  Extract<Visitor, { kind: "guest" }>
> {
  const token = randomBytes(32).toString("base64url");
  const id = randomUUID();
  const label = `Guest ${id.slice(0, 4)}`;
  await db
    .insert(supportGuests)
    .values({ id, tokenHash: hashToken(token), label });

  (await cookies()).set(GUEST_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.DEPLOY_ENV !== "development",
    maxAge: GUEST_RETENTION_DAYS * 24 * 60 * 60,
    path: COOKIE_PATH,
  });

  return { kind: "guest", guestId: id, label };
}

/**
 * Blocks the guest behind a relayed message. Returns the guest's id, or null
 * when the message was not a guest's (a member's, or not ours at all).
 */
export async function blockGuestByMessage(
  messageId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ guestId: supportMessages.guestId })
    .from(supportMessages)
    .where(eq(supportMessages.messageId, messageId))
    .limit(1);
  if (!row?.guestId) return null;

  await db
    .update(supportGuests)
    .set({ blockedAt: sql`now()` })
    .where(eq(supportGuests.id, row.guestId));
  return row.guestId;
}

/** Threads a guest started, for deleting them when the guest is blocked. */
export async function threadsStartedBy(guestId: string): Promise<string[]> {
  const rows = await db
    .select({ threadId: supportConversations.threadId })
    .from(supportConversations)
    .where(
      and(
        eq(supportConversations.guestId, guestId),
        eq(supportConversations.role, "asker"),
      ),
    );
  return rows.map((row) => row.threadId);
}
