import { describe, expect, it } from "vitest";
import {
  BEVY,
  INVOLVEMENT,
  parseFormats,
  splitName,
  ugaEmail,
  bevyFormat,
  bevyRequiredColumns,
  bevySurvey,
  WIDE,
} from "./formats.js";

describe("formats", () => {
  it("prefers the profile's MyID email, then a uga.edu sign-in", () => {
    expect(ugaEmail({ uga_email: "ADA@uga.edu", email: "a@gmail.com" })).toBe(
      "ada@uga.edu",
    );
    expect(ugaEmail({ uga_email: null, email: "Ada@UGA.edu" })).toBe(
      "ada@uga.edu",
    );
    expect(ugaEmail({ uga_email: null, email: "a@gmail.com" })).toBeNull();
  });

  it("splits the preferred name only when the profile has no first or last name", () => {
    expect(splitName({ first_name: "Ada", last_name: "Lovelace" })).toEqual([
      "Ada",
      "Lovelace",
    ]);
    expect(splitName({ preferred_name: "Ada King Lovelace" })).toEqual([
      "Ada",
      "King Lovelace",
    ]);
    expect(splitName({ preferred_name: "Ada" })).toEqual(["Ada", ""]);
  });

  it("leaves people without a UGA email out of the Involvement Network list, and counts them", () => {
    const writer = INVOLVEMENT.writer();
    const out = writer.page([
      { user_id: "a", uga_email: "a@uga.edu" },
      { user_id: "b", email: "b@gmail.com" },
      { user_id: "b", email: "b@gmail.com" },
      { user_id: "a", uga_email: "a@uga.edu" },
    ]);
    expect(out).toEqual({ text: "a@uga.edu\r\n", count: 1 });
    expect(writer.skipped()).toBe(1);
  });

  it("falls back to the sign-in email for Bevy", () => {
    const out = BEVY.writer().page([
      { user_id: "b", email: "B@gmail.com", preferred_name: "Bo" },
    ]);
    expect(out.text).toBe("Bo,,b@gmail.com,TRUE,,,,\r\n");
  });

  it("takes commas and repeats, once each", () => {
    expect(parseFormats(["bevy, platform", "bevy"], "attendance")).toEqual([
      "bevy",
      "platform",
    ]);
    expect(() => parseFormats(["csv"], "attendance")).toThrow(
      'Unknown format "csv"',
    );
    expect(() => parseFormats(["bevy"], "responses")).toThrow(
      "Try platform, wide",
    );
    expect(() => parseFormats(["wide"], "stars")).toThrow("has one format");
  });

  it("fills the Bevy survey columns from a meeting's responses", () => {
    const survey = bevySurvey([
      {
        user_id: "u-1",
        definition: { bevy: "survey:level_of_developer_experience_1" },
        answer: "Advanced",
      },
      { user_id: "u-1", definition: {}, answer: "unmapped" },
    ]);
    expect(survey.columns).toEqual(["survey:level_of_developer_experience_1"]);
    const out = bevyFormat(survey)
      .writer()
      .page([{ user_id: "u-1", email: "a@uga.edu", preferred_name: "Ada" }]);
    expect(out.text).toBe("Ada,,a@uga.edu,TRUE,,,,,Advanced\r\n");
  });

  it("leaves out the survey answers of anyone missing a column Bevy requires", () => {
    const learn = "survey:how_did_you_learn_about_this_event_1";
    const level = "survey:how_familiar_are_you_with_google_developer_tools";
    const survey = bevySurvey(
      [
        { user_id: "u-1", definition: { bevy: learn }, answer: "Social media" },
        { user_id: "u-1", definition: { bevy: level }, answer: "1 - Novice" },
        { user_id: "u-2", definition: { bevy: level }, answer: "4 - Advanced" },
      ],
      [learn, level],
    );
    const out = bevyFormat(survey)
      .writer()
      .page([
        { user_id: "u-1", email: "a@uga.edu", preferred_name: "Ada" },
        { user_id: "u-2", email: "b@uga.edu", preferred_name: "Bo" },
      ]);
    expect(out.text).toBe(
      "Ada,,a@uga.edu,TRUE,,,,,Social media,1 - Novice\r\n" +
        "Bo,,b@uga.edu,TRUE,,,,,,\r\n",
    );
  });

  it("names the columns Bevy requires from questions.json", () => {
    expect(bevyRequiredColumns()).toEqual([
      "survey:how_did_you_learn_about_this_event_1",
      "survey:how_familiar_are_you_with_google_developer_tools",
    ]);
  });

  it("writes responses wide, one row per person, once every row is in", () => {
    const writer = WIDE.writer();
    expect(
      writer.page([
        {
          user_id: "u-1",
          email: "a@uga.edu",
          question_id: "q_one",
          answer: "A",
        },
        {
          user_id: "u-2",
          email: "b@uga.edu",
          question_id: "q_two",
          answer: "B",
        },
        {
          user_id: "u-1",
          email: "a@uga.edu",
          question_id: "q_two",
          answer: "C",
        },
      ]),
    ).toEqual({ text: "", count: 0 });
    expect(writer.end?.()).toEqual({
      text:
        "user_id,preferred_name,email,q_one,q_two\r\n" +
        "u-1,,a@uga.edu,A,C\r\n" +
        "u-2,,b@uga.edu,,B\r\n",
      count: 2,
    });
  });
});
