import { describe, expect, it } from "vitest";
import { docsStatusOf, type DocsStatusFacts } from "./docsStatus";

const AT = new Date("2026-10-30T16:00:00Z");

const facts = (
  over: {
    bundled?: boolean;
    requested?: boolean;
    pausedAt?: Date | null;
    publishedAt?: Date | null;
    proposal?: DocsStatusFacts["proposal"];
  } = {},
): DocsStatusFacts => ({
  bundled: over.bundled ?? false,
  project: {
    docsRequested: over.requested ?? false,
    docsPausedAt: over.pausedAt ?? null,
    docsFirstPublishedAt: over.publishedAt ?? null,
  },
  proposal: over.proposal ?? null,
});

describe("where a project's docs stand", () => {
  it("is off until the map says otherwise", () => {
    expect(docsStatusOf(facts())).toEqual({ kind: "off" });
  });

  it("is on once the map has it, and published once a version has been", () => {
    expect(docsStatusOf(facts({ requested: true }))).toEqual({ kind: "on" });
    expect(docsStatusOf(facts({ requested: true, publishedAt: AT }))).toEqual({
      kind: "published",
      at: AT,
    });
  });

  it("is a pull request while one is being opened or is open, with its address once it has one", () => {
    expect(
      docsStatusOf(facts({ proposal: { enable: true, prUrl: null } })),
    ).toEqual({ kind: "proposal", enable: true, prUrl: null });
    expect(
      docsStatusOf(
        facts({
          requested: true,
          publishedAt: AT,
          proposal: { enable: false, prUrl: "https://github.com/o/r/pull/1" },
        }),
      ),
    ).toEqual({
      kind: "proposal",
      enable: false,
      prUrl: "https://github.com/o/r/pull/1",
    });
  });

  it("is paused when the repository changed owner, before anything else", () => {
    expect(
      docsStatusOf(
        facts({
          requested: true,
          pausedAt: AT,
          publishedAt: AT,
          proposal: { enable: true, prUrl: "https://github.com/o/r/pull/1" },
        }),
      ),
    ).toEqual({ kind: "paused" });
  });

  it("ignores a pause on a project whose docs are not on", () => {
    expect(docsStatusOf(facts({ pausedAt: AT }))).toEqual({ kind: "off" });
  });

  it("is bundled for the site's own docs, whatever else is recorded", () => {
    expect(
      docsStatusOf(facts({ bundled: true, requested: true, pausedAt: AT })),
    ).toEqual({ kind: "bundled" });
  });

  it("stays off after docs were turned off, even if a version once published", () => {
    expect(docsStatusOf(facts({ publishedAt: AT }))).toEqual({ kind: "off" });
  });
});
