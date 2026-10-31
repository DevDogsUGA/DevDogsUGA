import { describe, expect, it } from "vitest";
import { contributionRows } from "./view";

const SHA = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";

const item = {
  repo: "DevDogsUGA/site",
  sha: SHA,
  title: "  Fix nav  ",
  url: `https://github.com/DevDogsUGA/site/commit/${SHA}`,
  committedAt: new Date("2026-10-14T15:00:00Z"),
};

describe("contributionRows", () => {
  it("keeps the order given and links github.com commits", () => {
    const other = "0".repeat(40);
    const rows = contributionRows([item, { ...item, sha: other }]);
    expect(rows.map((r) => r.key)).toEqual([SHA, other]);
    expect(rows[0]).toMatchObject({
      label: "Fix nav",
      short: "a1b2c3d",
      href: item.url,
    });
  });

  it("never turns a non-github URL into a link", () => {
    const [row] = contributionRows([{ ...item, url: "javascript:alert(1)" }]);
    expect(row!.href).toBeNull();
  });

  it("falls back to the short id for an empty title", () => {
    expect(contributionRows([{ ...item, title: " " }])[0]!.label).toBe(
      "Commit a1b2c3d",
    );
  });
});
