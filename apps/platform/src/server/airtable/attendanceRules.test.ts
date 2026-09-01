import { describe, expect, it } from "vitest";
import { checkAttendance, myIdToEmail } from "./refusals";

/**
 * MyID parsing and the refusal rules, with no database anywhere near them.
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
  // A form response naming both links, which is the ordinary workshop night.
  const ok = {
    airtableRecordId: "recA",
    rawMyId: "jdoe",
    email: "jdoe@uga.edu",
    hasMeetingLink: true,
    linkedMeetingId: "m1",
    hasWorkshopLink: true,
    workshopId: "w1",
    workshopMeetingId: "m1",
  };

  it("passes a complete, resolvable response", () => {
    expect(checkAttendance(ok).refusals).toEqual([]);
  });

  it("passes a response naming only the meeting", () => {
    // The case the second link was added for: an Interest Meeting, a Social or
    // a judging night runs no workshops, so there is nothing to pick and an
    // empty Workshop cell is the correct answer rather than a missing one.
    const result = checkAttendance({
      ...ok,
      hasWorkshopLink: false,
      workshopId: null,
      workshopMeetingId: null,
    });
    expect(result.refusals).toEqual([]);
  });

  it("passes a response naming only the workshop", () => {
    // Every response written before the Meeting link existed looks like this,
    // and so does one an officer files from the workshop's own grid.
    const result = checkAttendance({
      ...ok,
      hasMeetingLink: false,
      linkedMeetingId: null,
    });
    expect(result.refusals).toEqual([]);
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
    // Present and unresolvable, which is the distinction the whole rule turns
    // on: an EMPTY cell is now a legitimate answer, and a filled one naming a
    // workshop that is not on the site is not.
    const result = checkAttendance({
      ...ok,
      workshopId: null,
      workshopMeetingId: null,
    });
    expect(result.refusals).toHaveLength(1);
    expect(result.refusals[0]!.code).toBe("attendance_unknown_workshop");
  });

  it("refuses a meeting the platform does not know", () => {
    // Usually a meeting still missing a start or an end time, so it exists in
    // the base and is not published. Named separately from the workshop case
    // because the officer has to go and look at a different row.
    const result = checkAttendance({ ...ok, linkedMeetingId: null });
    expect(result.refusals).toHaveLength(1);
    expect(result.refusals[0]!.code).toBe("attendance_unknown_meeting");
  });

  it("refuses two links that name different nights", () => {
    // The disagreement the old derive-from-the-workshop design made
    // unrepresentable. The composite foreign key would reject this row anyway;
    // refusing by name says which two cells to look at instead of failing an
    // INSERT mid-pull.
    const result = checkAttendance({ ...ok, workshopMeetingId: "m2" });
    expect(result.refusals).toHaveLength(1);
    expect(result.refusals[0]!.code).toBe(
      "attendance_workshop_meeting_mismatch",
    );
    expect(result.rejectedFields).toEqual(new Set(["meeting", "workshop"]));
  });

  it("reports the MyID first when both are wrong", () => {
    // Not arbitrary: a person can fix their own MyID, but the workshop link is
    // an officer's job. Lead with the one the reader can act on.
    const result = checkAttendance({
      ...ok,
      rawMyId: "nope@gmail.com",
      email: null,
      workshopId: null,
      workshopMeetingId: null,
    });
    expect(result.refusals).toHaveLength(1);
    expect(result.refusals[0]!.code).toBe("attendance_bad_myid");
  });
});
