import { describe, expect, it } from "vitest";
import {
  createPendingAttendanceClaim,
  verifyPendingAttendanceClaim,
} from "./pendingAttendanceClaim";

const SECRET = "a-test-secret-that-is-long-enough";
const MEETING_ID = "a1000000-0000-4000-a000-000000000001";
const NOW = new Date("2026-09-11T20:00:00.000Z");

describe("pending attendance claims", () => {
  it("survives an OAuth round trip", async () => {
    const value = await createPendingAttendanceClaim(
      SECRET,
      MEETING_ID,
      "manual_code",
      NOW,
    );
    await expect(
      verifyPendingAttendanceClaim(
        SECRET,
        value,
        new Date(NOW.getTime() + 9 * 60_000),
      ),
    ).resolves.toEqual({
      meetingId: MEETING_ID,
      method: "manual_code",
      issuedAt: Math.floor(NOW.getTime() / 1000),
    });
  });

  it("rejects expired, future, malformed, and altered claims", async () => {
    const value = await createPendingAttendanceClaim(
      SECRET,
      MEETING_ID,
      "qr",
      NOW,
    );
    await expect(
      verifyPendingAttendanceClaim(
        SECRET,
        value,
        new Date(NOW.getTime() + 10 * 60_000 + 1_000),
      ),
    ).resolves.toBeNull();
    await expect(
      verifyPendingAttendanceClaim(
        SECRET,
        value,
        new Date(NOW.getTime() - 61_000),
      ),
    ).resolves.toBeNull();
    await expect(
      verifyPendingAttendanceClaim(SECRET, "not-a-claim", NOW),
    ).resolves.toBeNull();
    await expect(
      verifyPendingAttendanceClaim(
        SECRET,
        value.replace(MEETING_ID, "a1000000-0000-4000-a000-000000000002"),
        NOW,
      ),
    ).resolves.toBeNull();
  });
});
