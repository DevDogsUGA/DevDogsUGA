import { describe, expect, it } from "vitest";
import { checkAttendance, myIdToEmail } from "./refusals";

/**
 * MyID parsing and the two refusal rules, with no database anywhere near them.
 *
 * These want a test each and no fixture. What a person types into a form in a
 * noisy room is the least predictable input this system has, and every case
 * here is somebody having a bad day rather than a hypothetical.
 */

describe("myIdToEmail", () => {
  it("takes a bare MyID", () => {
    expect(myIdToEmail("jdoe")).toBe("jdoe@uga.edu");
  });

  it("takes a full UGA address too", () => {
    // Somebody will type the whole thing however the field is labelled.
    expect(myIdToEmail("jdoe@uga.edu")).toBe("jdoe@uga.edu");
  });

  it("case-folds and trims", () => {
    // MyIDs are handed out in one case and typed in another, and a form field
    // collects whatever the phone keyboard capitalised.
    expect(myIdToEmail("  JDoe  ")).toBe("jdoe@uga.edu");
    expect(myIdToEmail("JDOE@UGA.EDU")).toBe("jdoe@uga.edu");
  });

  it("keeps the dots and dashes MyIDs actually contain", () => {
    expect(myIdToEmail("j.doe-smith_1")).toBe("j.doe-smith_1@uga.edu");
  });

  it("refuses another domain", () => {
    // The one that matters. Sign-in is Google restricted to hd=uga.edu, so
    // nobody could ever sign into an account created for a gmail address. It
    // would hold somebody's attendance permanently out of reach.
    expect(myIdToEmail("jdoe@gmail.com")).toBeNull();
    expect(myIdToEmail("jdoe@uga.edu.evil.com")).toBeNull();
    expect(myIdToEmail("jdoe@gatech.edu")).toBeNull();
  });

  it("refuses a name, an empty field, and a sentence", () => {
    expect(myIdToEmail("Jane Doe")).toBeNull();
    expect(myIdToEmail("")).toBeNull();
    expect(myIdToEmail("   ")).toBeNull();
    expect(myIdToEmail(null)).toBeNull();
    expect(myIdToEmail("i don't have one")).toBeNull();
  });

  it("refuses a bare @uga.edu with no local part", () => {
    expect(myIdToEmail("@uga.edu")).toBeNull();
  });
});

describe("checkAttendance", () => {
  const ok = {
    airtableRecordId: "recA",
    rawMyId: "jdoe",
    email: "jdoe@uga.edu",
    workshopId: "w1",
    meetingId: "m1",
  };

  it("passes a complete, resolvable response", () => {
    expect(checkAttendance(ok).refusals).toEqual([]);
  });

  it("refuses an unusable MyID and quotes it back", () => {
    // Quoting the raw value is the difference between a message an officer can
    // act on and one they have to go looking for the row to understand.
    const result = checkAttendance({
      ...ok,
      rawMyId: "jdoe@gmail.com",
      email: null,
    });
    expect(result.refusals).toHaveLength(1);
    expect(result.refusals[0]!.code).toBe("attendance_bad_myid");
    expect(result.refusals[0]!.message).toContain("jdoe@gmail.com");
    expect(result.refusals[0]!.table).toBe("attendance");
  });

  it("refuses a workshop the platform does not know", () => {
    const result = checkAttendance({
      ...ok,
      workshopId: null,
      meetingId: null,
    });
    expect(result.refusals).toHaveLength(1);
    expect(result.refusals[0]!.code).toBe("attendance_unknown_workshop");
  });

  it("refuses a workshop that resolved but has no meeting", () => {
    // Different cause from the above, same consequence: attendance is keyed on
    // the meeting rather than the workshop, so without a meeting there is no
    // key to write.
    const result = checkAttendance({ ...ok, meetingId: null });
    expect(result.refusals[0]!.code).toBe("attendance_unknown_workshop");
  });

  it("reports the MyID first when both are wrong", () => {
    // Not arbitrary: a person can fix their own MyID, but the workshop link is
    // an officer's job. Lead with the one the reader can act on.
    const result = checkAttendance({
      ...ok,
      rawMyId: "nope@gmail.com",
      email: null,
      workshopId: null,
      meetingId: null,
    });
    expect(result.refusals).toHaveLength(1);
    expect(result.refusals[0]!.code).toBe("attendance_bad_myid");
  });
});
