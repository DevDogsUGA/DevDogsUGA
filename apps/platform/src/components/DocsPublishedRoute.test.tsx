import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DIGEST,
  fakeBucket,
  publication,
} from "~/server/docs/published/fixtures";
import type { DocsBucket } from "~/server/docs/published/bucket";

const { bucketRef } = vi.hoisted(() => ({
  bucketRef: { current: null as DocsBucket | null },
}));
vi.mock("next/cache", () => ({ cacheLife: vi.fn() }));
vi.mock("~/server/docs/published/bucket", () => ({
  docsBucket: () => bucketRef.current,
}));
vi.mock("~/env", () => ({
  env: { BASE_URL: "http://localhost:3000", GITHUB_ORG: "DevDogsUGA" },
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
  usePathname: () => "/docs/demo",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
// The pieces that need a browser or a session are not what is under test.
vi.mock("~/components/DocsCodeCopy", () => ({ default: () => null }));
vi.mock("~/components/DocsGithubLogin", () => ({ default: () => null }));
vi.mock("~/components/DocsVscode", () => ({ default: () => null }));
vi.mock("~/components/DocsSidebar", () => ({ default: () => null }));
vi.mock("~/components/DocsVariants", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("~/components/DocsProgress/StepPager", () => ({
  default: () => null,
}));
vi.mock("~/components/TableOfContents", () => ({
  default: () => null,
  InlineTableOfContents: () => null,
}));

import { DocsPageRoute, DocsProjectIndex, docsPageMetadata } from "./DocsRoute";

async function element(node: Promise<React.ReactNode> | React.ReactNode) {
  return render(<>{await node}</>);
}

beforeEach(() => {
  bucketRef.current = fakeBucket(publication());
});

describe("/docs/<slug> for a published project", () => {
  it("renders a page's compiled HTML with its images on the asset route", async () => {
    const { container } = await element(
      DocsPageRoute({
        project: "demo",
        slug: ["guide", "start"],
        mode: "public",
      }),
    );
    const article = container.querySelector("article")!;
    expect(article.textContent).toContain("See home.");
    expect(article.querySelector("img")?.getAttribute("src")).toBe(
      `/docs-assets/demo/${DIGEST}/img/shot.png`,
    );
    expect(article.querySelector('a[href="/docs/demo"]')).not.toBeNull();
    expect(container.textContent).toContain("Start here");
    // No "Edit on GitHub" to this repository's docs, and no VS Code handoff.
    expect(container.querySelector(".textlink")).toBeNull();
    expect(article.className).toContain("docs-no-vscode");
  });

  it("sends the project root on to its first page", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      element(DocsProjectIndex({ project: "demo", mode: "public" })),
    ).rejects.toThrow("NEXT_REDIRECT /docs/demo/index");
  });

  it("lists a folder that has no index page", async () => {
    const { container } = await element(
      DocsPageRoute({ project: "demo", slug: ["guide"], mode: "public" }),
    );
    expect(container.textContent).toContain("Start here");
  });

  it("404s an unknown project, an unknown page and an unknown folder", async () => {
    await expect(
      element(
        DocsPageRoute({ project: "nobody", slug: ["index"], mode: "public" }),
      ),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      element(
        DocsPageRoute({ project: "demo", slug: ["missing"], mode: "public" }),
      ),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(
      Promise.resolve(DocsProjectIndex({ project: "nobody", mode: "public" })),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("404s everything while nothing is published or there is no bucket", async () => {
    bucketRef.current = null;
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      element(
        DocsPageRoute({ project: "demo", slug: ["index"], mode: "public" }),
      ),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    bucketRef.current = fakeBucket({});
    await expect(
      Promise.resolve(DocsProjectIndex({ project: "demo", mode: "public" })),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("never serves a published project in the early-access preview", async () => {
    await expect(
      DocsPageRoute({ project: "demo", slug: ["index"], mode: "preview" }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("titles the page for its project, with no link card", async () => {
    const metadata = await docsPageMetadata({
      project: "demo",
      slug: ["guide", "start"],
      mode: "public",
    });
    expect(metadata.title).toBe("Start here | Demo docs");
    expect(metadata.openGraph).toBeUndefined();
    expect(
      await docsPageMetadata({
        project: "nobody",
        slug: ["x"],
        mode: "public",
      }),
    ).toEqual({});
  });
});
