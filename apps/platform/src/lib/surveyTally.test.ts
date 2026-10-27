import type { Question } from "@devdogsuga/events";
import { describe, expect, it } from "vitest";
import { tallyQuestion } from "./surveyTally";

const choice = {
  id: "how_heard",
  scope: "meeting",
  prompt: "How did you hear about us?",
  type: "choice",
  options: [
    { id: "discord", label: "Discord" },
    { id: "friend", label: "A friend" },
  ],
  other: true,
} as Question;

describe("tallyQuestion", () => {
  it("counts every option, including ones nobody picked, and Other", () => {
    const tally = tallyQuestion(choice, [
      { option: "discord" },
      { option: "discord" },
      { other: "A flyer" },
    ]);
    expect(tally.responses).toBe(3);
    expect(tally.buckets).toEqual([
      { label: "Discord", count: 2 },
      { label: "A friend", count: 0 },
      { label: "Other", count: 1 },
    ]);
  });

  it("counts a multi-choice answer once per option chosen", () => {
    const multi = { ...choice, type: "multiChoice", other: false } as Question;
    const tally = tallyQuestion(multi, [
      { options: ["discord", "friend"] },
      { options: ["friend"] },
    ]);
    expect(tally.responses).toBe(2);
    expect(tally.buckets).toEqual([
      { label: "Discord", count: 1 },
      { label: "A friend", count: 2 },
    ]);
  });

  it("walks a scale from min to max", () => {
    const scale = {
      id: "rating",
      scope: "meeting",
      prompt: "Rate it",
      type: "scale",
      min: 1,
      max: 3,
    } as Question;
    expect(
      tallyQuestion(scale, [{ value: 3 }, { value: 3 }, { value: 1 }]).buckets,
    ).toEqual([
      { label: "1", count: 1 },
      { label: "2", count: 0 },
      { label: "3", count: 2 },
    ]);
  });

  it("gives free text a response count and no buckets", () => {
    const text = { ...choice, type: "longText" } as Question;
    const tally = tallyQuestion(text, [{ text: "hi" }]);
    expect(tally).toMatchObject({ responses: 1, buckets: null });
  });
});
