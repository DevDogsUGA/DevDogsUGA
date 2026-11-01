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

const NEWEST = "9".repeat(40);
const OLDER = "2".repeat(40);

const render = (activity: Partial<PublicProfileActivity>) =>
  renderToStaticMarkup(
    <PublicProfile
      profile={profile}
      activity={{
        links: null,
        weekly: { current: 0, longest: 0, semesters: [] },
        contributions: null,
        badges: [],
        ...activity,
      }}
      treatment="frost"
    />,
  );

describe("the Contributions section", () => {
  it("is absent when the member hides it", () => {
    expect(render({})).not.toContain("Contributions");
  });

  it("says so when shown but empty", () => {
    const html = render({ contributions: [] });
    expect(html).toContain("Contributions");
    expect(html).toContain("No commits yet.");
  });

  it("lists commits linked to GitHub, in the order given", () => {
    const html = render({
      contributions: [
        {
          repo: "DevDogsUGA/site",
          sha: NEWEST,
          title: "Newest",
          url: `https://github.com/DevDogsUGA/site/commit/${NEWEST}`,
          committedAt: new Date("2026-10-20T16:00:00Z"),
        },
        {
          repo: "DevDogsUGA/site",
          sha: OLDER,
          title: "Older",
          url: `https://github.com/DevDogsUGA/site/commit/${OLDER}`,
          committedAt: new Date("2026-10-01T16:00:00Z"),
        },
      ],
    });
    expect(html).toContain(
      `href="https://github.com/DevDogsUGA/site/commit/${NEWEST}"`,
    );
    expect(html.indexOf("Newest")).toBeLessThan(html.indexOf("Older"));
    expect(html).toContain("DevDogsUGA/site@9999999");
  });
});
