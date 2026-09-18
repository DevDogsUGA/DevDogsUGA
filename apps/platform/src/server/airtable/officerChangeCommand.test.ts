import { describe, expect, it } from "vitest";
import {
  InvalidOfficerChangeError,
  normalizeOfficerChange,
  officerChangeDigest,
  parseOfficerChangeActor,
  parseOfficerChangeRecord,
  rawOfficerChangeDigest,
} from "./officerChangeCommand";
import { officerChangesTable } from "@devdogsuga/airtable";

const ID = "10000000-0000-4000-a000-000000000001";

describe("normalizeOfficerChange", () => {
  it("normalizes a MyID in an attendance addition", () => {
    expect(
      normalizeOfficerChange({
        kind: "attendance",
        action: "add",
        meetingId: ID,
        member: "  AbC123  ",
        reason: "Missed paper roster",
      }),
    ).toMatchObject({ member: "abc123@uga.edu" });
  });

  it("rejects a non-UGA member address", () => {
    expect(() =>
      normalizeOfficerChange({
        kind: "attendance",
        action: "add",
        meetingId: ID,
        member: "member@gmail.com",
        reason: "Correction",
      }),
    ).toThrow(InvalidOfficerChangeError);
  });

  it("requires a reflection edit to change something", () => {
    expect(() =>
      normalizeOfficerChange({
        kind: "reflection",
        action: "edit",
        reflectionId: ID,
        reason: "Correction",
      }),
    ).toThrow(/at least one field/);
  });

  it("does not allow two activity assignments", () => {
    expect(() =>
      normalizeOfficerChange({
        kind: "reflection",
        action: "edit",
        reflectionId: ID,
        meetingId: ID,
        competitionId: "20000000-0000-4000-a000-000000000002",
        reason: "Correction",
      }),
    ).toThrow(/only one activity/);
  });

  it("accepts every participation override decision", () => {
    for (const action of ["grant", "revoke", "clear"] as const) {
      expect(
        normalizeOfficerChange({
          kind: "competition_participation",
          action,
          teamId: ID,
          reason: "Judging roster correction",
        }),
      ).toMatchObject({ action });
    }
  });
});

describe("parseOfficerChangeRecord", () => {
  it("maps field IDs and an explicit Draft state", () => {
    const fields = officerChangesTable.fields;
    expect(
      parseOfficerChangeRecord({
        id: "recCommand",
        fields: {
          [fields.command.id]: "Edit reflection",
          [fields.targetId.id]: ID,
          [fields.reason.id]: "Officer correction",
          [fields.reflectionState.id]: "Draft",
        },
      }),
    ).toEqual({
      kind: "reflection",
      action: "edit",
      reflectionId: ID,
      reason: "Officer correction",
      submitted: false,
    });
  });

  it("maps the explicit clear-content checkbox to an empty body", () => {
    const fields = officerChangesTable.fields;
    expect(
      parseOfficerChangeRecord({
        id: "recCommand",
        fields: {
          [fields.command.id]: "Edit reflection",
          [fields.targetId.id]: ID,
          [fields.reason.id]: "Remove content at the member's request",
          [fields.clearReflectionContent.id]: true,
        },
      }),
    ).toMatchObject({ content: "" });
  });

  it("rejects replacement content together with the clear checkbox", () => {
    const fields = officerChangesTable.fields;
    expect(() =>
      parseOfficerChangeRecord({
        id: "recCommand",
        fields: {
          [fields.command.id]: "Edit reflection",
          [fields.targetId.id]: ID,
          [fields.reason.id]: "Conflicting correction",
          [fields.reflectionContent.id]: "Replacement",
          [fields.clearReflectionContent.id]: true,
        },
      }),
    ).toThrow(/not both/);
  });
});

describe("parseOfficerChangeActor", () => {
  it("requires and normalizes Airtable's immutable Created by value", () => {
    const fields = officerChangesTable.fields;
    expect(
      parseOfficerChangeActor({
        id: "recCommand",
        fields: {
          [fields.createdBy.id]: {
            id: "usrOfficer",
            email: "OFFICER@UGA.EDU",
            name: " Officer Name ",
          },
        },
      }),
    ).toEqual({
      airtableUserId: "usrOfficer",
      email: "officer@uga.edu",
      displayName: "Officer Name",
    });
  });
});

describe("officerChangeDigest", () => {
  it("is stable after normalization and changes with the command", async () => {
    const first = normalizeOfficerChange({
      kind: "attendance",
      action: "add",
      meetingId: ID,
      member: "ABC123",
      reason: "Correction",
    });
    const equivalent = normalizeOfficerChange({
      kind: "attendance",
      action: "add",
      meetingId: ID,
      member: "abc123@uga.edu",
      reason: "Correction",
    });
    const changed = normalizeOfficerChange({
      ...equivalent,
      reason: "Different correction",
    });

    await expect(officerChangeDigest(first)).resolves.toBe(
      await officerChangeDigest(equivalent),
    );
    await expect(officerChangeDigest(changed)).resolves.not.toBe(
      await officerChangeDigest(first),
    );
  });

  it("pins invalid form fields without depending on object key order", async () => {
    const createdBy = officerChangesTable.fields.createdBy.id;
    const first = {
      id: "recCommand",
      fields: {
        [createdBy]: { id: "usrOfficer", email: "officer@uga.edu" },
      },
    };
    const equivalent = {
      id: "recCommand",
      fields: {
        [createdBy]: { email: "officer@uga.edu", id: "usrOfficer" },
      },
    };

    await expect(rawOfficerChangeDigest(first)).resolves.toBe(
      await rawOfficerChangeDigest(equivalent),
    );
  });
});
