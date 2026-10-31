// @vitest-environment node
import { describe, expect, it } from "vitest";
import { shouldStoreCommit } from "./policy";

describe("shouldStoreCommit (Q56)", () => {
  it("stores a commit whose author resolved to a linked member", () => {
    expect(shouldStoreCommit("d2820000-0000-4000-a000-000000000001")).toBe(
      true,
    );
  });

  it.each([null, undefined, ""])(
    "skips a commit that resolved to no member (%j)",
    (member) => {
      expect(shouldStoreCommit(member)).toBe(false);
    },
  );
});
