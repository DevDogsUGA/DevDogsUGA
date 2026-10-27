import { describe, expect, it } from "vitest";
import { questionsConfigSchema, type Question } from "./questions";
import { clubConfigSchema, type Meeting } from "./schema";
import { validateClubConfig } from "./validator";

const experience: Question = {
  id: "developer_experience",
  scope: "member",
  prompt: "My level of developer experience is…",
  type: "choice",
  options: [
    { id: "new", label: "Just starting" },
    { id: "projects", label: "I've built projects" },
  ],
  bevy: "survey:level_of_developer_experience_1",
};

const rating: Question = {
  id: "session_rating",
  scope: "meeting",
  prompt: "How useful was tonight?",
  type: "scale",
  min: 1,
  max: 5,
  required: true,
};

function meeting(questions?: string[]): Meeting {
  return {
    slug: "2026-09-14",
    title: "Cold Start",
    summary: "The first meeting of the year.",
    series: null,
    kicker: null,
    category: "milestone",
    brand: "devdogs",
    venue: {
      id: "dlw",
      kind: "campus",
      name: "Dining, Learning, and Well-Being Center",
      building: "DLW",
      room: "124",
    },
    building: "DLW",
    location: "124",
    startsAt: "2026-09-14T22:00:00.000Z",
    endsAt: "2026-09-14T23:30:00.000Z",
    rsvpUrl: null,
    cancelledAt: null,
    cancellationReason: null,
    countsForCredit: true,
    surveyUrl: null,
    ...(questions ? { questions } : {}),
    agenda: [],
  };
}

const codes = (meetings: Meeting[], questions: Question[]) =>
  validateClubConfig({ meetings }, { questions }).map((i) => i.code);

describe("questionsConfigSchema", () => {
  it("accepts every question type", () => {
    const parsed = questionsConfigSchema.parse({
      $schema: "./questions.schema.json",
      questions: [
        experience,
        rating,
        {
          id: "working_on",
          scope: "meeting",
          prompt: "What are you working on?",
          type: "text",
          maxLength: 280,
          prefill: "last",
        },
        {
          id: "notes",
          scope: "meeting",
          prompt: "Anything else?",
          type: "longText",
        },
        {
          id: "topics",
          scope: "member",
          prompt: "What do you want to learn?",
          type: "multiChoice",
          options: [
            { id: "web", label: "Web" },
            { id: "mobile", label: "Mobile", retired: true },
          ],
          other: true,
          maxSelected: 2,
        },
      ],
    });
    expect(parsed.questions).toHaveLength(5);
  });

  it("refuses a misspelled key, a camelCase id and a stray choice field", () => {
    expect(
      questionsConfigSchema.safeParse({
        questions: [{ ...rating, requird: true }],
      }).success,
    ).toBe(false);
    expect(
      questionsConfigSchema.safeParse({
        questions: [{ ...rating, id: "sessionRating" }],
      }).success,
    ).toBe(false);
    expect(
      questionsConfigSchema.safeParse({
        questions: [{ ...rating, options: [] }],
      }).success,
    ).toBe(false);
  });

  it("refuses a multiChoice whose minimum exceeds its maximum", () => {
    const multi = {
      ...experience,
      type: "multiChoice",
      minSelected: 2,
      maxSelected: 1,
    };
    expect(
      questionsConfigSchema.safeParse({ questions: [multi] }).success,
    ).toBe(false);
  });
});

describe("meetings and questions together", () => {
  it("accepts a meeting listing meeting questions", () => {
    expect(codes([meeting(["session_rating"])], [experience, rating])).toEqual(
      [],
    );
  });

  it("refuses an unknown, a member, and a twice-listed question", () => {
    expect(
      codes(
        [
          meeting([
            "nope",
            "developer_experience",
            "session_rating",
            "session_rating",
          ]),
        ],
        [experience, rating],
      ),
    ).toEqual([
      "unknown_question",
      "member_question_listed",
      "question_listed_twice",
    ]);
  });

  it("refuses duplicate ids, duplicate options, and prefill on a member question", () => {
    expect(
      codes(
        [],
        [
          {
            ...experience,
            prefill: "last",
            options: [experience.options[0]!, experience.options[0]!],
          },
          rating,
          rating,
        ],
      ),
    ).toEqual([
      "member_question_prefill",
      "duplicate_option_id",
      "duplicate_question_id",
    ]);
  });

  it("refuses a misspelled meeting key now that meetings are strict", () => {
    const parsed = clubConfigSchema.safeParse({
      meetings: [{ ...meeting(), questons: [] }],
    });
    expect(parsed.success).toBe(false);
  });
});
