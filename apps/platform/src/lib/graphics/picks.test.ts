import { describe, expect, it } from "vitest";
import { MAX_PICKS, parsePicks, pickValue } from "./picks";

const allowed = {
  subjects: ["meeting", "workshop-1"],
  formats: ["og", "instagram-story"],
};

describe("parsePicks", () => {
  it("reads subject@format pairs and drops duplicates", () => {
    const result = parsePicks(
      ["meeting@og", "workshop-1@instagram-story", "meeting@og"],
      allowed,
    );
    expect(result).toEqual({
      ok: true,
      picks: [
        { subject: "meeting", format: "og" },
        { subject: "workshop-1", format: "instagram-story" },
      ],
    });
  });

  it("round-trips pickValue", () => {
    const pick = { subject: "workshop-1", format: "og" };
    expect(parsePicks([pickValue(pick)], allowed)).toEqual({
      ok: true,
      picks: [pick],
    });
  });

  it.each([
    [[], "Pick at least one."],
    [["meeting"], 'Unknown graphic "meeting".'],
    [["nope@og"], 'Unknown graphic "nope@og".'],
    [["meeting@icon-16"], 'Unknown size "icon-16".'],
  ])("refuses %j", (values, reason) => {
    expect(parsePicks(values, allowed)).toEqual({ ok: false, reason });
  });

  it("refuses more than the cap", () => {
    const subjects = Array.from({ length: MAX_PICKS + 1 }, (_, i) => `s${i}`);
    const result = parsePicks(
      subjects.map((s) => `${s}@og`),
      { subjects, formats: ["og"] },
    );
    expect(result.ok).toBe(false);
  });
});
