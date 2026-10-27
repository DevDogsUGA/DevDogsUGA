import { describe, expect, it } from "vitest";
import type { AccountRow } from "../production/accounts.js";
import { planAttendance } from "./plan.js";
import type { Attendee } from "./sheet.js";

function attendee(email: string, name: string | null = "Someone"): Attendee {
  return { email, name, line: 2 };
}

function account(
  userId: string,
  authEmail: string,
  preferredName?: string,
): AccountRow {
  return {
    userId,
    authEmail,
    ugaEmail: null,
    hasProfile: true,
    preferredName: preferredName ?? null,
    involvementFirstName: null,
    involvementLastName: null,
  };
}

const ACCOUNTS = [
  account("u-new", "new@uga.edu"),
  account("u-qr", "qr@uga.edu"),
  account("u-imp", "imp@uga.edu"),
  account("u-gone", "gone@uga.edu", "Gone Member"),
];

const EXISTING = [
  { userId: "u-qr", method: "qr" },
  { userId: "u-imp", method: "import" },
  { userId: "u-gone", method: "import" },
];

describe("planAttendance", () => {
  it("records only who has no check-in yet, and never touches a member's own", () => {
    const plan = planAttendance(
      [
        attendee("new@uga.edu"),
        attendee("qr@uga.edu"),
        attendee("imp@uga.edu"),
        attendee("fresh@uga.edu", "Fresh Face"),
        attendee("nameless@uga.edu", null),
      ],
      ACCOUNTS,
      EXISTING,
      false,
    );
    expect(plan.record.map((m) => m.userId)).toEqual(["u-new"]);
    expect(plan.checkedIn.map((m) => [m.userId, m.method])).toEqual([
      ["u-qr", "qr"],
    ]);
    expect(plan.imported.map((m) => m.userId)).toEqual(["u-imp"]);
    expect(plan.create.map((a) => a.email)).toEqual(["fresh@uga.edu"]);
    expect(plan.cannotCreate.map((a) => a.email)).toEqual(["nameless@uga.edu"]);
    expect(plan.remove).toEqual([]);
  });

  it("ignores a deleted member's row (userId null) even with replace", () => {
    const plan = planAttendance(
      [attendee("imp@uga.edu")],
      ACCOUNTS,
      [...EXISTING, { userId: null, method: "import" }],
      true,
    );
    expect(plan.remove.map((r) => r.userId)).toEqual(["u-gone"]);
  });

  it("with replace, removes only imported rows the sheet no longer lists", () => {
    const plan = planAttendance(
      [attendee("imp@uga.edu")],
      ACCOUNTS,
      EXISTING,
      true,
    );
    // u-qr checked in themselves and is absent from the sheet: still kept.
    expect(plan.remove).toEqual([{ userId: "u-gone", name: "Gone Member" }]);
  });
});
