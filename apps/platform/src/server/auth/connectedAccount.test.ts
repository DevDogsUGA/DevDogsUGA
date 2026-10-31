import { describe, expect, it } from "vitest";
import {
  guildNickname,
  isSuccessfulRemovalStatus,
  withConnectedAccountStatus,
} from "./connectedAccount";

describe("connected-account side-effect statuses", () => {
  it.each([200, 204, 404])("accepts idempotent removal status %i", (status) => {
    expect(isSuccessfulRemovalStatus(status)).toBe(true);
  });

  it.each([401, 403, 500])("rejects removal status %i", (status) => {
    expect(isSuccessfulRemovalStatus(status)).toBe(false);
  });
});

describe("connected-account callback status", () => {
  it("preserves the callback query and hash", () => {
    expect(
      withConnectedAccountStatus(
        "/dashboard/profile?tab=profiles#discord",
        "error",
        "identity_already_exists",
        "discord",
      ),
    ).toBe(
      "/dashboard/profile?tab=profiles&connectedAccountStatus=error&connectedAccountCode=identity_already_exists&connectedAccountProvider=discord#discord",
    );
  });
});

describe("Discord guild nickname", () => {
  it("keeps a name within the limit", () => {
    expect(guildNickname("  Uga Dawg ")).toBe("Uga Dawg");
  });

  it("cuts a long name to 32 code points without splitting an emoji", () => {
    const nick = guildNickname("A".repeat(31) + "🐶🐶");
    expect(nick).toBe("A".repeat(31) + "🐶");
  });

  it("sends no nickname for a blank name", () => {
    expect(guildNickname("   ")).toBeUndefined();
  });
});
