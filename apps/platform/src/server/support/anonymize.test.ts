import { describe, expect, it } from "vitest";
import { anonymize } from "./anonymize";

describe("anonymize", () => {
  it("replaces user, role and channel mentions", () => {
    expect(anonymize("ask <@123> or <@!456> in <#789>, <@&42> knows")).toBe(
      "ask @member or @member in #channel, @role knows",
    );
  });

  it("drops the widget's context line", () => {
    expect(
      anonymize("How do I seed?\n-# Asked from [Setup](<https://x>) · <@1>"),
    ).toBe("How do I seed?");
  });

  it("keeps custom emoji names and dates timestamps", () => {
    expect(anonymize("<:party:1> <a:wave:2> <t:0:R>")).toBe(
      ":party: :wave: 1970-01-01",
    );
  });
});
