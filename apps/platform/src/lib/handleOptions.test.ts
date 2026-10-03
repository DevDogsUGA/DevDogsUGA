import { describe, expect, it } from "vitest";
import type { SetHandleOutcome } from "~/server/actions/profileHandle";
import type { HandleOptionKind } from "~/server/loaders/publicProfiles";
import {
  HANDLE_KIND_LABELS,
  describeHandleOutcome,
  handleKindLabel,
  handleUrlPath,
  revealsConnectedUsername,
} from "./handleOptions";

const KINDS: HandleOptionKind[] = [
  "github",
  "discord",
  "myid",
  "legal_full",
  "legal_initial",
  "preferred_full",
  "preferred_initial",
  "suffixed",
];

describe("handle kind labels", () => {
  it("words every kind", () => {
    expect(KINDS.map(handleKindLabel)).toEqual([
      "GitHub username",
      "Discord username",
      "MyID",
      "Legal name",
      "Legal name, last initial",
      "Preferred name",
      "Preferred name, last initial",
      "Numbered",
    ]);
    expect(Object.keys(HANDLE_KIND_LABELS).sort()).toEqual([...KINDS].sort());
  });

  it("flags only the connected-account kinds as publishing a username", () => {
    expect(KINDS.filter(revealsConnectedUsername)).toEqual([
      "github",
      "discord",
    ]);
  });

  it("shows the profile path for an option", () => {
    expect(handleUrlPath({ handle: "ada" })).toBe("/community/@ada");
  });
});

describe("describeHandleOutcome", () => {
  const outcomes: SetHandleOutcome[] = [
    { status: "set", handle: "ada" },
    { status: "taken" },
    { status: "not_offered" },
    { status: "blocked" },
    { status: "no_profile" },
    { status: "rate_limited" },
  ];

  it("gives every outcome non-empty inline copy", () => {
    for (const outcome of outcomes) {
      expect(describeHandleOutcome(outcome).message.length).toBeGreaterThan(10);
    }
  });

  it("confirms a saved handle", () => {
    expect(describeHandleOutcome({ status: "set", handle: "ada" })).toEqual({
      tone: "success",
      message: "Your handle is now @ada.",
      refresh: false,
    });
  });

  it("tells a lost race to pick another and re-reads the options", () => {
    const taken = describeHandleOutcome({ status: "taken" });
    expect(taken.message).toBe("That handle was just taken. Pick another.");
    expect(taken.refresh).toBe(true);
  });

  it("re-reads the options only when they may have changed", () => {
    expect(
      outcomes
        .filter((o) => describeHandleOutcome(o).refresh)
        .map((o) => o.status),
    ).toEqual(["taken", "not_offered"]);
  });
});
