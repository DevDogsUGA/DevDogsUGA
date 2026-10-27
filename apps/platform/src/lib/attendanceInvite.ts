/**
 * Pure rules for an officer adding someone to a meeting by UGA address
 * (console meeting detail, Q8 and Q51): the MyID an officer types, the invite
 * token's shape and the dates it lives between. No database or request here,
 * so every rule is unit-tested without either.
 */

export const UGA_DOMAIN = "uga.edu";

/** How long an emailed claim link stays valid (Q51). */
export const INVITE_LIFETIME_DAYS = 14;

/** A MyID is letters and digits only; this is looser than UGA's own rule. */
const MYID_PATTERN = /^[a-z0-9]{2,32}$/;

export type MyIdResult =
  { ok: true; myId: string; email: string } | { ok: false; error: string };

/**
 * Turns what an officer typed into the address to look up. Officers type only
 * the MyID; `@uga.edu` is fixed after it, so anything with an `@` (a full
 * address, someone else's domain) is refused rather than trimmed, and names
 * can never be entered.
 */
export function parseMyId(input: string): MyIdResult {
  const myId = input.trim().toLowerCase();
  if (myId === "") return { ok: false, error: "Enter a MyID." };
  if (myId.includes("@")) {
    return {
      ok: false,
      error: `Type only the MyID; @${UGA_DOMAIN} is added for you.`,
    };
  }
  if (!MYID_PATTERN.test(myId)) {
    return {
      ok: false,
      error: "A MyID is 2 to 32 letters and digits, with no spaces.",
    };
  }
  return { ok: true, myId, email: `${myId}@${UGA_DOMAIN}` };
}

/** Whether the signed-in address is the invited one. Addresses are case-blind. */
export function addressesMatch(invited: string, signedIn: string | null) {
  return (
    signedIn !== null &&
    invited.trim().toLowerCase() === signedIn.trim().toLowerCase()
  );
}

export function inviteExpiry(from: Date): Date {
  return new Date(from.getTime() + INVITE_LIFETIME_DAYS * 24 * 60 * 60 * 1000);
}

export type InviteState = "pending" | "claimed" | "expired";

export function inviteState(
  invite: { claimedAt: Date | null; expiresAt: Date },
  now: Date,
): InviteState {
  if (invite.claimedAt !== null) return "claimed";
  return invite.expiresAt <= now ? "expired" : "pending";
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

/** A fresh single-use secret: 32 random bytes, URL-safe. */
export function generateInviteToken(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)));
}

/** What the database stores in place of the token: its SHA-256, hex. */
export async function hashInviteToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** A token is 43 URL-safe characters; anything else is not worth a lookup. */
export function looksLikeInviteToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(value);
}

/**
 * A meeting an officer may edit attendance for (Q52): it has started and is
 * neither cancelled nor deleted. There is no time lock after it ends.
 */
export function isMeetingEditable(
  meeting: {
    startsAt: Date;
    cancelledAt: Date | null;
    deletedAt?: Date | null;
  },
  now: Date,
): boolean {
  return (
    meeting.startsAt <= now &&
    meeting.cancelledAt === null &&
    (meeting.deletedAt ?? null) === null
  );
}
