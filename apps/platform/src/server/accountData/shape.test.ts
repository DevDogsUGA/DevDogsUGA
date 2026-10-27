import { describe, expect, it } from "vitest";
import {
  ANOTHER_PERSON,
  shapeAuditEvent,
  shapeFiledReport,
  shapeIdentity,
  shapeReflectionRevision,
} from "./shape";

/**
 * "Download my data" must hold the member's own rows and nothing that belongs
 * to somebody else or lets anyone sign in as the member (account-deletion Q6).
 * These feed the shapers rows that carry exactly such things.
 */

const ME = "11111111-1111-4111-8111-111111111111";
const OFFICER = "22222222-2222-4222-8222-222222222222";
const DATE = new Date("2026-10-01T12:00:00Z");

describe("shapeIdentity", () => {
  it("keeps the account's name and drops tokens and provider payload", () => {
    const shaped = shapeIdentity({
      provider: "github",
      createdAt: DATE,
      lastSignInAt: DATE,
      identityData: {
        user_name: "octo",
        email: "octo@example.com",
        provider_token: "gho_secret",
        access_token: "secret",
        avatar_url: "https://example.com/a.png",
        sub: "12345",
      },
    });
    expect(shaped.account).toEqual({
      user_name: "octo",
      email: "octo@example.com",
    });
    expect(JSON.stringify(shaped)).not.toContain("secret");
  });

  it("copes with identity data that is not an object", () => {
    expect(
      shapeIdentity({
        provider: "discord",
        createdAt: null,
        lastSignInAt: null,
        identityData: null,
      }).account,
    ).toEqual({});
  });
});

describe("shapeReflectionRevision", () => {
  const row = {
    id: "r1",
    reflectionId: "f1",
    meetingId: "m1",
    content: "what I learned",
    submittedAt: DATE,
    createdAt: DATE,
    changeReason: null,
  };

  it("says who saved it without naming an officer", () => {
    const byOfficer = shapeReflectionRevision(
      { ...row, createdByUserId: OFFICER },
      ME,
    );
    expect(byOfficer.savedBy).toBe("an officer");
    expect(JSON.stringify(byOfficer)).not.toContain(OFFICER);
    expect(
      shapeReflectionRevision({ ...row, createdByUserId: ME }, ME).savedBy,
    ).toBe("you");
  });
});

describe("shapeFiledReport", () => {
  it("leaves out the reported member and what they wrote", () => {
    const shaped = shapeFiledReport({
      id: "p1",
      appId: "a1",
      contentType: "post",
      reason: "spam",
      description: "my words",
      status: "open",
      createdAt: DATE,
      resolvedAt: null,
      // Hostile extras a careless select * would have carried along.
      ...({
        reportedUserId: OFFICER,
        contentSnapshot: "someone else's message",
        contentRef: "post-9",
      } as object),
    });
    const text = JSON.stringify(shaped);
    expect(text).not.toContain(OFFICER);
    expect(text).not.toContain("someone else's message");
    expect(text).not.toContain("post-9");
    expect(shaped.description).toBe("my words");
  });
});

describe("shapeAuditEvent", () => {
  const event = {
    id: "e1",
    createdAt: DATE,
    action: "x",
    targetType: "user",
    targetId: OFFICER,
    metadata: { name: "Somebody Else", ids: [OFFICER] },
  };

  it("hides another member's id and the details of acting on them", () => {
    const shaped = shapeAuditEvent(event, ME);
    expect(shaped.targetId).toBe(ANOTHER_PERSON);
    expect(shaped.metadata).toBeNull();
    expect(JSON.stringify(shaped)).not.toContain(OFFICER);
  });

  it("keeps the details of an action on the member themself", () => {
    const shaped = shapeAuditEvent(
      { ...event, targetId: ME, metadata: { byOfficer: false } },
      ME,
    );
    expect(shaped.targetId).toBe(ME);
    expect(shaped.metadata).toEqual({ byOfficer: false });
  });

  it("drops the metadata of events that target something else", () => {
    const shaped = shapeAuditEvent(
      { ...event, targetType: "attendance", targetId: "row-1" },
      ME,
    );
    expect(shaped.targetId).toBe("row-1");
    expect(shaped.metadata).toBeNull();
  });
});
