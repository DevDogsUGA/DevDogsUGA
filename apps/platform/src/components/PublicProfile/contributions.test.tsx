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
  visibility: { name: true, avatar: true, bio: true, links: true, stars: true },
};

const render = (activity: Partial<PublicProfileActivity>) =>
  renderToStaticMarkup(
    <PublicProfile
      profile={profile}
      activity={{ links: null, stars: null, contributions: null, ...activity }}
    />,
  );

describe("the Contributions section", () => {
  it("is absent when the member hides it", () => {
    expect(render({})).not.toContain("Contributions");
  });

  it("says so when shown but empty", () => {
    const html = render({ contributions: [] });
    expect(html).toContain("Contributions");
    expect(html).toContain("No merged pull requests yet.");
  });

  it("lists merged pull requests linked to GitHub, in the order given", () => {
    const html = render({
      contributions: [
        {
          repo: "DevDogsUGA/site",
          number: 9,
          title: "Newest",
          url: "https://github.com/DevDogsUGA/site/pull/9",
          mergedAt: new Date("2026-10-20T16:00:00Z"),
        },
        {
          repo: "DevDogsUGA/site",
          number: 2,
          title: "Older",
          url: "https://github.com/DevDogsUGA/site/pull/2",
          mergedAt: new Date("2026-10-01T16:00:00Z"),
        },
      ],
    });
    expect(html).toContain('href="https://github.com/DevDogsUGA/site/pull/9"');
    expect(html.indexOf("Newest")).toBeLessThan(html.indexOf("Older"));
    expect(html).toContain("DevDogsUGA/site #9");
  });
});
