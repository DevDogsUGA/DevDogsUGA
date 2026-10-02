import { describe, expect, it } from "vitest";
import type { Question } from "@devdogsuga/events";
import {
  OTHER,
  fieldName,
  otherFieldName,
  readAnswer,
  sameAnswer,
} from "./form";

const learn: Question = {
  id: "how_did_you_learn",
  scope: "meeting",
  prompt: "How did you learn about this event?",
  type: "choice",
  options: [
    { id: "discord", label: "Discord" },
    { id: "friend", label: "A friend" },
  ],
  other: true,
};

const topics: Question = {
  id: "topics",
  scope: "member",
  prompt: "Topics?",
  type: "multiChoice",
  options: [
    { id: "web", label: "Web" },
    { id: "mobile", label: "Mobile" },
  ],
  other: true,
  maxSelected: 2,
};

function form(entries: [string, string][]): FormData {
  const data = new FormData();
  for (const [k, v] of entries) data.append(k, v);
  return data;
}

describe("readAnswer", () => {
  it("reads a choice, Other with its text, and a blank as no answer", () => {
    const id = learn.id;
    expect(readAnswer(learn, form([[fieldName(id), "discord"]]))).toEqual({
      answer: { option: "discord" },
    });
    expect(
      readAnswer(
        learn,
        form([
          [fieldName(id), OTHER],
          [otherFieldName(id), " Reddit "],
        ]),
      ),
    ).toEqual({ answer: { other: "Reddit" } });
    expect(readAnswer(learn, form([]))).toEqual({ answer: null });
    expect(readAnswer(learn, form([[fieldName(id), OTHER]]))).toHaveProperty(
      "error",
    );
    expect(readAnswer(learn, form([[fieldName(id), "nope"]]))).toEqual({
      error: "Pick one of the choices.",
    });
  });

  it("reads checked boxes, Other included, against the limits", () => {
    const id = topics.id;
    expect(
      readAnswer(
        topics,
        form([
          [fieldName(id), "web"],
          [fieldName(id), OTHER],
          [otherFieldName(id), "AI"],
        ]),
      ),
    ).toEqual({ answer: { options: ["web"], other: "AI" } });
    expect(
      readAnswer(
        topics,
        form([
          [fieldName(id), "web"],
          [fieldName(id), "mobile"],
          [fieldName(id), OTHER],
          [otherFieldName(id), "AI"],
        ]),
      ),
    ).toEqual({ error: "Pick 1 to 2." });
  });

  it("reads text trimmed and a scale as a number", () => {
    const text: Question = {
      id: "t",
      scope: "meeting",
      prompt: "p",
      type: "text",
      maxLength: 3,
    };
    expect(readAnswer(text, form([[fieldName("t"), "  hi "]]))).toEqual({
      answer: { text: "hi" },
    });
    expect(readAnswer(text, form([[fieldName("t"), "   "]]))).toEqual({
      answer: null,
    });
    expect(readAnswer(text, form([[fieldName("t"), "long"]]))).toEqual({
      error: "Keep it under 3 characters.",
    });
    const scale: Question = {
      id: "s",
      scope: "meeting",
      prompt: "p",
      type: "scale",
      min: 1,
      max: 5,
    };
    expect(readAnswer(scale, form([[fieldName("s"), "4"]]))).toEqual({
      answer: { value: 4 },
    });
  });
});

describe("sameAnswer", () => {
  it("ignores key order and tells answers apart", () => {
    expect(
      sameAnswer(
        { options: ["web"], other: "AI" },
        {
          other: "AI",
          options: ["web"],
        },
      ),
    ).toBe(true);
    expect(sameAnswer({ option: "web" }, { option: "mobile" })).toBe(false);
    expect(sameAnswer(null, null)).toBe(true);
    expect(sameAnswer({ option: "web" }, null)).toBe(false);
  });
});
