import { describe, expect, it } from "vitest";
import {
  addressesMatch,
  generateInviteToken,
  hashInviteToken,
  INVITE_LIFETIME_DAYS,
  inviteExpiry,
  inviteState,
  isMeetingEditable,
  looksLikeInviteToken,
  parseMyId,
} from "./attendanceInvite";

describe("parseMyId", () => {
  it("fixes @uga.edu after a MyID and lowercases it", () => {
    expect(parseMyId("  AB12345 ")).toEqual({
      ok: true,
      myId: "ab12345",
      email: "ab12345@uga.edu",
    });
  });

  it("refuses an address, another domain, a name and the empty string", () => {
    for (const input of [
      "ab12345@uga.edu",
      "ab12345@gmail.com",
      "Jane Doe",
      "a",
      "",
      "   ",
      "ab_12",
      "a".repeat(33),
    ]) {
      expect(parseMyId(input).ok).toBe(false);
    }
  });
});

describe("addressesMatch", () => {
  it("compares case-blind and refuses a missing address", () => {
    expect(addressesMatch("ab1@uga.edu", "AB1@uga.edu")).toBe(true);
    expect(addressesMatch("ab1@uga.edu", "ab2@uga.edu")).toBe(false);
    expect(addressesMatch("ab1@uga.edu", null)).toBe(false);
  });
});

describe("invite lifetime and state", () => {
  const now = new Date("2026-10-26T12:00:00Z");

  it("expires 14 days out", () => {
    expect(INVITE_LIFETIME_DAYS).toBe(14);
    expect(inviteExpiry(now).toISOString()).toBe("2026-11-09T12:00:00.000Z");
  });

  it("is pending, expired at the boundary, or claimed", () => {
    const expiresAt = inviteExpiry(now);
    expect(inviteState({ claimedAt: null, expiresAt }, now)).toBe("pending");
    expect(inviteState({ claimedAt: null, expiresAt }, expiresAt)).toBe(
      "expired",
    );
    expect(inviteState({ claimedAt: now, expiresAt }, expiresAt)).toBe(
      "claimed",
    );
  });
});

describe("invite tokens", () => {
  it("generates distinct 43-character URL-safe tokens", () => {
    const a = generateInviteToken();
    expect(looksLikeInviteToken(a)).toBe(true);
    expect(a).not.toBe(generateInviteToken());
    expect(looksLikeInviteToken("short")).toBe(false);
  });

  it("hashes to a stable 64-character hex digest that is not the token", async () => {
    const token = generateInviteToken();
    const hash = await hashInviteToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(await hashInviteToken(token));
    expect(hash).not.toContain(token);
  });
});

describe("isMeetingEditable", () => {
  const now = new Date("2026-10-26T12:00:00Z");
  const past = new Date("2026-10-26T11:00:00Z");
  const future = new Date("2026-10-26T13:00:00Z");

  it("needs a started meeting that is neither cancelled nor deleted", () => {
    expect(isMeetingEditable({ startsAt: past, cancelledAt: null }, now)).toBe(
      true,
    );
    expect(isMeetingEditable({ startsAt: now, cancelledAt: null }, now)).toBe(
      true,
    );
    expect(
      isMeetingEditable({ startsAt: future, cancelledAt: null }, now),
    ).toBe(false);
    expect(isMeetingEditable({ startsAt: past, cancelledAt: past }, now)).toBe(
      false,
    );
    expect(
      isMeetingEditable(
        { startsAt: past, cancelledAt: null, deletedAt: past },
        now,
      ),
    ).toBe(false);
  });
});
