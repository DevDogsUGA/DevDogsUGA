import { describe, expect, it } from "vitest";
import {
  attendanceQrUrl,
  createManualCode,
  createQrChallenge,
  verifyManualCode,
  verifyQrChallenge,
} from "./attendanceChallenge";

const SECRET = "a test secret with enough entropy to resemble production";
const MEETING_ID = "aaaaaaaa-0000-4000-a000-000000000001";
const OTHER_MEETING_ID = "bbbbbbbb-0000-4000-a000-000000000001";
const BUCKET_START = new Date("2026-09-11T16:00:00.000Z");

describe("attendance QR challenges", () => {
  it("accepts the current and immediately previous bucket", async () => {
    const current = await createQrChallenge(SECRET, MEETING_ID, BUCKET_START);
    expect(
      await verifyQrChallenge(
        SECRET,
        current,
        new Date(BUCKET_START.getTime() + 29_999),
      ),
    ).toBe(true);
    expect(
      await verifyQrChallenge(
        SECRET,
        current,
        new Date(BUCKET_START.getTime() + 30_000),
      ),
    ).toBe(true);
  });

  it("rejects expired, future, altered, and cross-meeting challenges", async () => {
    const challenge = await createQrChallenge(SECRET, MEETING_ID, BUCKET_START);
    expect(
      await verifyQrChallenge(
        SECRET,
        challenge,
        new Date(BUCKET_START.getTime() + 60_000),
      ),
    ).toBe(false);
    expect(
      await verifyQrChallenge(SECRET, {
        ...challenge,
        bucket: challenge.bucket + 1,
      }),
    ).toBe(false);
    expect(
      await verifyQrChallenge(
        SECRET,
        {
          ...challenge,
          token: `${challenge.token.startsWith("a") ? "b" : "a"}${challenge.token.slice(1)}`,
        },
        BUCKET_START,
      ),
    ).toBe(false);
    expect(
      await verifyQrChallenge(
        SECRET,
        { ...challenge, meetingId: OTHER_MEETING_ID },
        BUCKET_START,
      ),
    ).toBe(false);
  });

  it("builds a same-origin attendance URL without leaking the secret", async () => {
    const challenge = await createQrChallenge(SECRET, MEETING_ID, BUCKET_START);
    const url = new URL(attendanceQrUrl("https://devdogsuga.org", challenge));
    expect(url.origin).toBe("https://devdogsuga.org");
    expect(url.pathname).toBe("/attendance/claim");
    expect(url.searchParams.get("meeting")).toBe(MEETING_ID);
    expect(url.toString()).not.toContain(SECRET);
  });
});

describe("attendance manual codes", () => {
  it("always emits six digits and validates current or previous codes", async () => {
    const code = await createManualCode(SECRET, MEETING_ID, BUCKET_START);
    expect(code).toMatch(/^\d{6}$/);
    expect(await verifyManualCode(SECRET, MEETING_ID, code, BUCKET_START)).toBe(
      true,
    );
    expect(
      await verifyManualCode(
        SECRET,
        MEETING_ID,
        code,
        new Date(BUCKET_START.getTime() + 30_000),
      ),
    ).toBe(true);
  });

  it("uses a separate domain and rejects malformed or expired guesses", async () => {
    const code = await createManualCode(SECRET, MEETING_ID, BUCKET_START);
    const qr = await createQrChallenge(SECRET, MEETING_ID, BUCKET_START);
    expect(qr.token).not.toContain(code);
    expect(
      await verifyManualCode(SECRET, OTHER_MEETING_ID, code, BUCKET_START),
    ).toBe(false);
    expect(
      await verifyManualCode(SECRET, MEETING_ID, "12345", BUCKET_START),
    ).toBe(false);
    expect(
      await verifyManualCode(
        SECRET,
        MEETING_ID,
        code,
        new Date(BUCKET_START.getTime() + 60_000),
      ),
    ).toBe(false);
  });
});
