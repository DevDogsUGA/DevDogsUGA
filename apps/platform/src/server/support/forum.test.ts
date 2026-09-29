import { describe, expect, it, vi } from "vitest";
import type { ForumTags } from "./forum";

vi.mock("~/env", () => ({ env: { DISCORD_GUILD_ID: "1" } }));
vi.mock("~/server/discord/api", () => ({ asBot: vi.fn() }));

const { statusOf, withStatusTag } = await import("./forum");

function forum(names: Record<string, string>): ForumTags {
  const tags: ForumTags = { byName: new Map(), byId: new Map() };
  for (const [id, name] of Object.entries(names)) {
    tags.byName.set(name.toLowerCase(), id);
    tags.byId.set(id, name);
  }
  return tags;
}

const tags = forum({
  r: "Resolved",
  d: "Duplicate",
  f: "FAQ",
  p: "Platform",
});

describe("statusOf", () => {
  it("is open with no closing tag, whatever else is applied", () => {
    expect(statusOf(tags, [])).toBe("open");
    expect(statusOf(tags, ["p", "f"])).toBe("open");
  });

  it("is resolved under Resolved or Duplicate", () => {
    expect(statusOf(tags, ["r"])).toBe("resolved");
    expect(statusOf(tags, ["p", "d"])).toBe("resolved");
  });

  it("is open when the forum has no closing tags yet", () => {
    expect(statusOf(forum({}), ["x"])).toBe("open");
  });
});

describe("withStatusTag", () => {
  it("resolving adds Resolved once and keeps the rest", () => {
    expect(withStatusTag(tags, ["p"], "resolved")).toEqual(["r", "p"]);
    expect(withStatusTag(tags, ["r", "p"], "resolved")).toEqual(["r", "p"]);
  });

  it("reopening drops Resolved and Duplicate but keeps FAQ and projects", () => {
    expect(withStatusTag(tags, ["r", "d", "f", "p"], "open")).toEqual([
      "f",
      "p",
    ]);
  });

  it("stays within Discord's five-tag cap", () => {
    const full = ["a", "b", "c", "e", "g"];
    expect(withStatusTag(tags, full, "resolved")).toHaveLength(5);
  });

  it("changes nothing when the forum lacks a Resolved tag", () => {
    expect(withStatusTag(forum({}), ["p"], "resolved")).toEqual(["p"]);
  });
});
