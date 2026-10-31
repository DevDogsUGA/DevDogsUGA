import { describe, expect, it } from "vitest";
import type { DocsMenuEntry } from "~/config/docs";
import { docsSectionLabel, docsSectionOf, docsSlugOf } from "./docsSection";

const contribute: DocsMenuEntry[] = ["platform", "porchlight"].map((slug) => ({
  id: slug,
  href: `/docs/${slug}`,
  name: slug,
  description: null,
  mark: { kind: "fallback" },
  project: slug,
}));

describe("docsSlugOf", () => {
  it("reads the project out of a docs address", () => {
    expect(docsSlugOf("/docs/platform/guides/x")).toBe("platform");
    expect(docsSlugOf("/docs/a%20b")).toBe("a b");
    expect(docsSlugOf("/docs")).toBeNull();
    expect(docsSlugOf("/events/platform")).toBeNull();
    expect(docsSlugOf(null)).toBeNull();
  });
});

describe("docsSectionOf", () => {
  it("is neither menu off the docs", () => {
    expect(docsSectionOf(null, contribute)).toBeNull();
    expect(docsSectionOf("/events", contribute)).toBeNull();
    expect(docsSectionOf("/docsy", contribute)).toBeNull();
  });

  it("gives a Contribute project's whole docs to Contribute", () => {
    expect(docsSectionOf("/docs/platform", contribute)).toBe("contribute");
    expect(docsSectionOf("/docs/platform/guides/testing", contribute)).toBe(
      "contribute",
    );
    expect(docsSectionOf("/docs/porchlight/start", contribute)).toBe(
      "contribute",
    );
  });

  it("gives the platform's building-on-DevDogs guides to Docs, even though they sit in its folder", () => {
    expect(docsSectionOf("/docs/platform/guides/identity", contribute)).toBe(
      "docs",
    );
    expect(
      docsSectionOf("/docs/platform/guides/moderation/integrating", contribute),
    ).toBe("docs");
    expect(docsSectionOf("/docs/platform/guides/reporting", contribute)).toBe(
      "docs",
    );
    expect(
      docsSectionOf("/docs/toolkit/reference/api/sdk/env", contribute),
    ).toBe("docs");
  });

  it("gives everything else under /docs to Docs", () => {
    expect(docsSectionOf("/docs", contribute)).toBe("docs");
    expect(docsSectionOf("/docs/workshops/supabase", contribute)).toBe("docs");
    expect(docsSectionOf("/docs/operations/deploys", contribute)).toBe("docs");
  });
});

describe("docsSectionLabel", () => {
  it("labels a search result by the menu its page is in", () => {
    expect(docsSectionLabel("workshops", "supabase/nextjs/01-intro")).toBe(
      "Docs",
    );
    expect(docsSectionLabel("toolkit", "")).toBe("Docs");
    expect(docsSectionLabel("platform", "guides/identity/index")).toBe("Docs");
    expect(docsSectionLabel("platform", "guides/testing")).toBe("Contribute");
    expect(docsSectionLabel("platform", "")).toBe("Contribute");
    expect(docsSectionLabel("schedule-builder", "guides/schema")).toBe(
      "Contribute",
    );
    expect(docsSectionLabel("porchlight", "start")).toBe("Contribute");
  });
});
