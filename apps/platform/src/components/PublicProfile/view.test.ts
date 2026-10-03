import { describe, expect, it } from "vitest";
import type { PublicProfile } from "~/server/loaders/publicProfiles";
import { headingFor, linkItemsFor, metadataFor } from "./view";

const base: PublicProfile = {
  handle: "ada",
  displayName: "Ada Lovelace",
  avatarUrl: null,
  bio: "Writes compilers.",
  roleDescription: null,
  githubHandle: null,
  discordHandle: null,
  linkedinName: null,
  visibility: {
    name: true,
    avatar: true,
    bio: true,
    links: true,
    competitions: true,
    contributions: true,
    stars: true,
  },
};

describe("headingFor", () => {
  it("uses the name, or the handle when the name is hidden", () => {
    expect(headingFor(base)).toBe("Ada Lovelace");
    expect(headingFor({ ...base, displayName: null })).toBe("@ada");
  });
});

describe("linkItemsFor", () => {
  it("is empty when links are hidden, whatever the profile carries", () => {
    expect(linkItemsFor({ ...base, githubHandle: "ada" }, null)).toEqual([]);
  });

  it("lists custom links then connected accounts", () => {
    const items = linkItemsFor(
      {
        ...base,
        githubHandle: "ada",
        discordHandle: "ada#1",
        linkedinName: "Ada L",
      },
      [{ title: "Site", url: "https://ada.dev" }],
    );
    expect(items).toEqual([
      { label: "Site", href: "https://ada.dev" },
      { label: "GitHub: ada", href: "https://github.com/ada" },
      { label: "Discord: ada#1", href: null },
      { label: "LinkedIn: Ada L", href: null },
    ]);
  });

  it("drops a custom link that is not http(s)", () => {
    expect(
      linkItemsFor(base, [{ title: "x", url: "javascript:alert(1)" }]),
    ).toEqual([]);
  });
});

describe("metadataFor", () => {
  it("builds from public fields", () => {
    expect(metadataFor(base)).toEqual({
      title: "Ada Lovelace | DevDogs",
      description: "Writes compilers.",
    });
  });

  it("falls back to handle and a neutral description when hidden", () => {
    expect(metadataFor({ ...base, displayName: null, bio: null })).toEqual({
      title: "@ada | DevDogs",
      description: "@ada is a member of DevDogs at UGA.",
    });
  });

  it("truncates a long bio", () => {
    const { description } = metadataFor({ ...base, bio: "x".repeat(300) });
    expect(description.length).toBeLessThanOrEqual(160);
    expect(description.endsWith("...")).toBe(true);
  });
});
