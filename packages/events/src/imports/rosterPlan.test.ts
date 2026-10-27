import { describe, expect, it } from "vitest";
import type { InvolvementMember } from "./roster.js";
import type { AccountRow } from "./accounts.js";
import { planImport } from "./rosterPlan.js";

function member(email: string, name = "Ada Lovelace"): InvolvementMember {
  const [firstName, lastName] = name.split(" ") as [string, string];
  return { email, firstName, lastName, positions: ["Member"] };
}

function account(userId: string, fields: Partial<AccountRow> = {}): AccountRow {
  return {
    userId,
    authEmail: null,
    ugaEmail: null,
    hasProfile: true,
    preferredName: null,
    involvementFirstName: null,
    involvementLastName: null,
    ...fields,
  };
}

describe("planImport", () => {
  it("sorts the roster into create, verify, keep and drop", () => {
    const plan = planImport(
      [member("new@uga.edu"), member("fresh@uga.edu"), member("kept@uga.edu")],
      [
        account("u-fresh", { authEmail: "fresh@uga.edu" }),
        account("u-kept", {
          authEmail: "kept@uga.edu",
          involvementFirstName: "Kept",
          involvementLastName: "Member",
        }),
        account("u-gone", {
          authEmail: "gone@uga.edu",
          preferredName: "Gone Member",
          involvementFirstName: "Gone",
          involvementLastName: "Member",
        }),
        account("u-never", { authEmail: "never@uga.edu" }),
      ],
    );
    expect(plan.create.map((m) => m.email)).toEqual(["new@uga.edu"]);
    expect(plan.verify.map((m) => m.userId)).toEqual(["u-fresh"]);
    expect(plan.keep.map((m) => m.userId)).toEqual(["u-kept"]);
    expect(plan.drop).toEqual([{ userId: "u-gone", name: "Gone Member" }]);
  });

  it("matches the profile's UGA email before the sign-in address", () => {
    // An officer signs in with a personal address and has their MyID one on
    // the profile; a second account with the MyID sign-in must not win.
    const plan = planImport(
      [member("ada@uga.edu")],
      [
        account("u-other", { authEmail: "ada@uga.edu" }),
        account("u-officer", {
          authEmail: "ada@gmail.com",
          ugaEmail: "ada@uga.edu",
        }),
      ],
    );
    expect(plan.verify.map((m) => m.userId)).toEqual(["u-officer"]);
    expect(plan.create).toEqual([]);
  });

  it("writes an account once when two roster emails land on it", () => {
    const plan = planImport(
      [member("ada@uga.edu"), member("lovelace@uga.edu")],
      [
        account("u-ada", {
          authEmail: "lovelace@uga.edu",
          ugaEmail: "ada@uga.edu",
        }),
      ],
    );
    expect(plan.verify.map((m) => m.member.email)).toEqual(["ada@uga.edu"]);
    expect(plan.sharedAccounts).toEqual([
      { email: "lovelace@uga.edu", userId: "u-ada" },
    ]);
  });

  it("lists a preferred name that differs from the roster's, case aside", () => {
    const plan = planImport(
      [member("ada@uga.edu"), member("alan@uga.edu", "Alan Turing")],
      [
        account("u-ada", {
          authEmail: "ada@uga.edu",
          preferredName: "Augusta King",
        }),
        account("u-alan", {
          authEmail: "alan@uga.edu",
          preferredName: "alan turing ",
        }),
      ],
    );
    expect(plan.nameDiffers.map((m) => m.userId)).toEqual(["u-ada"]);
  });

  it("marks an account with no profile so the import inserts one", () => {
    const plan = planImport(
      [member("ada@uga.edu")],
      [account("u-ada", { authEmail: "ada@uga.edu", hasProfile: false })],
    );
    expect(plan.verify[0]!.hasProfile).toBe(false);
  });
});
