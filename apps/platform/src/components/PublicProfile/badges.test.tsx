import { getBadges, getWorkshops } from "@devdogsuga/events";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { groupAwards, type AwardRow } from "~/server/badges/display";
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

function award(overrides: Partial<AwardRow> & { id: string }): AwardRow {
  return {
    badgeId: "mentor",
    workshopDefinitionId: null,
    method: "manual",
    awardedAt: new Date("2026-10-01T12:00:00Z"),
    awardedBy: "officer",
    awardedByName: "An Officer",
    citation: "Helped a teammate land a first PR",
    withdrawnAt: null,
    withdrawnReason: null,
    hidden: false,
    ...overrides,
  };
}

const render = (rows: AwardRow[]) => {
  const activity: PublicProfileActivity = {
    links: null,
    stars: null,
    contributions: null,
    badges: groupAwards(rows, getBadges(), getWorkshops().workshops),
  };
  return renderToStaticMarkup(
    <PublicProfile profile={profile} activity={activity} />,
  );
};

describe("the Badges section", () => {
  it("is absent without badges", () => {
    expect(render([])).not.toContain("Badges");
  });

  it("shows a badge, its citation and who awarded it", () => {
    const html = render([award({ id: "a" })]);
    expect(html).toContain("Badges");
    expect(html).toContain("Mentor");
    expect(html).toContain("Helped a teammate land a first PR");
    expect(html).toContain("awarded by An Officer");
  });

  it("shows a multiplier and every date for a repeated badge", () => {
    const html = render([
      award({ id: "a", awardedAt: new Date("2026-09-01T12:00:00Z") }),
      award({ id: "b", awardedAt: new Date("2026-10-01T12:00:00Z") }),
    ]);
    expect(html).toContain("×2");
    expect(html).toContain("2 dates");
    expect(html.match(/<time /g)).toHaveLength(2);
  });

  it("names a deleted officer as Deleted member", () => {
    const html = render([
      award({ id: "a", awardedBy: null, awardedByName: null }),
    ]);
    expect(html).toContain("awarded by Deleted member");
  });

  it("leaves a hidden badge and its citation out", () => {
    const html = render([award({ id: "a", hidden: true })]);
    expect(html).not.toContain("Mentor");
    expect(html).not.toContain("land a first PR");
  });

  it("does not present a workshop badge as an assessed skill", () => {
    const html = render([
      award({
        id: "a",
        badgeId: "workshop-completed",
        workshopDefinitionId: getWorkshops().workshops[0]!.id,
        method: "automatic",
        awardedBy: null,
        awardedByName: null,
        citation: null,
      }),
    ]);
    expect(html).toContain("Workshop completed:");
    expect(html).not.toMatch(/certif|proficien|skill/i);
  });
});
