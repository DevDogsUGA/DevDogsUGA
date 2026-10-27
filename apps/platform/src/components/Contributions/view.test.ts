import { describe, expect, it } from "vitest";
import { contributionRows } from "./view";

const item = {
  repo: "DevDogsUGA/site",
  number: 4,
  title: "  Fix nav  ",
  url: "https://github.com/DevDogsUGA/site/pull/4",
  mergedAt: new Date("2026-10-14T15:00:00Z"),
};

describe("contributionRows", () => {
  it("keeps the order given and links github.com pull requests", () => {
    const rows = contributionRows([item, { ...item, number: 3 }]);
    expect(rows.map((r) => r.key)).toEqual([
      "DevDogsUGA/site#4",
      "DevDogsUGA/site#3",
    ]);
    expect(rows[0]).toMatchObject({ label: "Fix nav", href: item.url });
  });

  it("never turns a non-github URL into a link", () => {
    const [row] = contributionRows([{ ...item, url: "javascript:alert(1)" }]);
    expect(row!.href).toBeNull();
  });

  it("falls back to the PR number for an empty title", () => {
    expect(contributionRows([{ ...item, title: " " }])[0]!.label).toBe(
      "Pull request #4",
    );
  });
});
