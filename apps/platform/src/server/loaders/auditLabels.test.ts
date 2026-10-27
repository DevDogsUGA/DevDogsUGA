import { describe, expect, it, vi } from "vitest";

vi.mock("~/server/db", () => ({ db: {} }));

const { DELETED_MEMBER, actorLabel, memberIdsIn, memberLabel, targetLabel } =
  await import("./auditLabels");

const GONE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const HERE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const known = new Map([[HERE, "Sam"]]);

describe("audit log member labels", () => {
  it("names a member who still exists", () => {
    expect(memberLabel(HERE, known)).toBe("Sam");
    expect(actorLabel(HERE, known)).toBe("Sam");
  });

  it("calls an id that no longer resolves a deleted member", () => {
    expect(memberLabel(GONE, known)).toBe(DELETED_MEMBER);
    expect(actorLabel(GONE, known)).toBe("Deleted member");
  });

  it("keeps System for events with no actor", () => {
    expect(actorLabel(null, known)).toBe("System");
  });

  it("labels only member targets", () => {
    expect(targetLabel({ targetType: "user", targetId: GONE }, known)).toBe(
      "Deleted member",
    );
    expect(targetLabel({ targetType: "user", targetId: HERE }, known)).toBe(
      "Sam",
    );
    expect(
      targetLabel({ targetType: "attendance", targetId: GONE }, known),
    ).toBeNull();
    expect(
      targetLabel({ targetType: "user", targetId: "not-an-id" }, known),
    ).toBeNull();
  });

  it("collects the actors and member targets of a page, once each", () => {
    const ids = memberIdsIn([
      { actorUserId: HERE, targetType: "user", targetId: GONE },
      { actorUserId: HERE, targetType: "attendance", targetId: GONE },
      { actorUserId: null, targetType: "user", targetId: "nope" },
    ]);
    expect(ids.sort()).toEqual([GONE, HERE].sort());
  });
});
