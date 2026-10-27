import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type {
  PublicProfile as Profile,
  PublicProfileActivity,
} from "~/server/loaders/publicProfiles";
import PublicProfile from ".";

const profile: Profile = {
  handle: "ada",
  displayName: "Ada Lovelace",
  avatarUrl: null,
  bio: null,
  roleDescription: null,
  githubHandle: null,
  discordHandle: null,
  linkedinName: null,
  graduationYear: null,
  majors: [],
  visibility: { name: true, avatar: true, bio: true, links: true },
};

const activity = (
  overrides: Partial<PublicProfileActivity> = {},
): PublicProfileActivity => ({
  links: null,
  contributions: null,
  badges: [],
  weekly: {
    current: 2,
    longest: 4,
    semesters: [
      {
        id: "fall-2026",
        label: "Fall 2026",
        weeks: [{ week: "2026-09-07", state: "lit" }],
        lit: 1,
        total: 1,
        text: "Fall 2026: 1 of 1 week",
        art: null,
      },
    ],
  },
  ...overrides,
});

const render = (a: PublicProfileActivity) =>
  renderToStaticMarkup(
    <PublicProfile profile={profile} activity={a} treatment="frost" />,
  );

describe("the weekly streak section", () => {
  it("is always shown, even when every other section is hidden", () => {
    const html = render(activity());
    expect(html).toContain("Weekly streak");
    expect(html).toContain("Fall 2026: 1 of 1 week");
    expect(html).toContain("Current streak");
    expect(html).not.toContain("Stars");
  });

  it("says so when no semester has started", () => {
    const html = render(
      activity({ weekly: { current: 0, longest: 0, semesters: [] } }),
    );
    expect(html).toContain("Weekly streak");
    expect(html).toContain("No semester has started yet.");
  });
});
