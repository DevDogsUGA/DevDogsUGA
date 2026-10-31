import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PublishedContent } from "~/server/docs/published/schema";
import type { LivePreview, PreviewLoad } from "~/server/docs/livePreview";

const mocks = vi.hoisted(() => ({
  require: vi.fn(),
  load: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: vi.fn() }));
vi.mock("~/env", () => ({
  env: { BASE_URL: "http://localhost:3000", GITHUB_ORG: "DevDogsUGA" },
}));
vi.mock("~/server/docs/previewAccess", () => ({
  requirePreviewProject: mocks.require,
}));
vi.mock("~/server/docs/livePreview", () => ({
  livePreviews: () => ({ load: mocks.load }),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
  usePathname: () => "/dashboard/docs-preview/demo",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("~/components/DocsCodeCopy", () => ({ default: () => null }));
vi.mock("~/components/DocsGithubLogin", () => ({ default: () => null }));
vi.mock("~/components/DocsVscode", () => ({ default: () => null }));
vi.mock("~/components/DocsVariants", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("~/components/DocsSidebar", () => ({
  default: (props: { base: string; projects: unknown[] }) => (
    <nav data-base={props.base} data-projects={props.projects.length} />
  ),
}));
vi.mock("~/components/DocsProgress/StepPager", () => ({
  default: () => null,
}));
vi.mock("~/components/TableOfContents", () => ({
  default: () => null,
  InlineTableOfContents: () => null,
}));
vi.mock("~/server/docs/queries", () => ({
  getDocsVariantGroups: () => ({
    os: { values: ["macos"], labels: { macos: "macOS" } },
    supabase: { values: ["hosted"] },
  }),
}));

import {
  PREVIEW_NOTE,
  PreviewIndex,
  PreviewLayout,
  PreviewPage,
  previewAssetUrl,
  previewMetadata,
} from "./DocsPreviewRoute";

const SHA = "b".repeat(40);

const content = (): PublishedContent => ({
  version: 1,
  project: {
    slug: "demo",
    name: "Demo",
    description: "A demo",
    order: null,
    os: ["macos"],
  },
  folders: [],
  assets: [
    {
      path: "img/logo.png",
      type: "image/png",
      bytes: 8,
      sha256: "c".repeat(64),
    },
  ],
  pages: [
    {
      path: "demo/index",
      title: "Overview",
      description: null,
      order: null,
      section: null,
      headings: [],
      html: '<p>Hello <img src="./img/logo.png" alt="logo"> <img src="./img/other.png" alt="x"></p>',
    },
    {
      path: "demo/guide",
      title: "Guide",
      description: null,
      order: null,
      section: "guides",
      headings: [],
      html: "<p>Guide text</p>",
    },
  ],
});

const preview = (over: Partial<LivePreview> = {}): LivePreview => ({
  slug: "demo",
  repoId: "1234",
  repository: "DevDogsUGA/demo",
  branch: "main",
  sha: SHA,
  readiness: { ready: true, problems: [], pages: 2, assets: 1 },
  content: content(),
  assets: {},
  ...over,
});

async function element(node: Promise<React.ReactNode> | React.ReactNode) {
  return render(<>{await node}</>);
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.require.mockResolvedValue({
    caller: { userId: "u-1" },
    project: { slug: "demo", repoId: "1234" },
  });
  mocks.load.mockResolvedValue({
    ok: true,
    preview: preview(),
  } satisfies PreviewLoad);
});

describe("a page of the live preview", () => {
  it("is the project's page with a note that highlighting comes with the published copy", async () => {
    const { container } = await element(
      PreviewPage({ slug: "demo", path: ["guide"] }),
    );
    expect(container.textContent).toContain("Guide text");
    expect(container.querySelector(".docs-note")?.textContent).toBe(
      PREVIEW_NOTE,
    );
    expect(PREVIEW_NOTE).toContain(
      "Code highlighting appears in the published copy",
    );
    expect(mocks.require).toHaveBeenCalledWith("demo");
    expect(mocks.load).toHaveBeenCalledWith({ slug: "demo", repoId: "1234" });
  });

  it("points an approved image at the preview's asset route for this commit, and drops one that isn't approved", async () => {
    const { container } = await element(
      PreviewPage({ slug: "demo", path: ["index"] }),
    );
    const images = [...container.querySelectorAll("img")];
    expect(images[0]?.getAttribute("src")).toBe(
      previewAssetUrl("demo", SHA, "img/logo.png"),
    );
    expect(previewAssetUrl("demo", SHA, "img/logo.png")).toBe(
      `/dashboard/docs-preview-assets/demo/${SHA}/img/logo.png`,
    );
    expect(images[1]?.hasAttribute("src")).toBe(false);
  });

  it("is a 404 for a page that is not there", async () => {
    await expect(
      element(PreviewPage({ slug: "demo", path: ["missing"] })),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("is never indexed, and titled as the preview", async () => {
    expect(await previewMetadata("demo", ["guide"])).toEqual({
      title: "Guide | DevDogs Docs preview",
      robots: { index: false, follow: false },
    });
  });
});

describe("the project's index and layout", () => {
  it("opens on the first page, inside the preview", async () => {
    await expect(element(PreviewIndex({ slug: "demo" }))).rejects.toThrow(
      /NEXT_REDIRECT \/dashboard\/docs-preview\/demo\//,
    );
  });

  it("puts the sidebar under the preview's address, with no project switcher", async () => {
    const { container } = await element(
      PreviewLayout({ slug: "demo", children: <p>child</p> }),
    );
    const nav = container.querySelector("nav")!;
    expect(nav.getAttribute("data-base")).toBe("/dashboard/docs-preview");
    expect(nav.getAttribute("data-projects")).toBe("1");
    expect(container.textContent).toContain("child");
  });
});

describe("when there is nothing to show", () => {
  it("says why GitHub could not give the docs, to a member who may ask", async () => {
    mocks.load.mockResolvedValue({
      ok: false,
      failure: { kind: "busy", message: "GitHub is busy right now." },
    });
    const { container } = await element(PreviewIndex({ slug: "demo" }));
    expect(container.textContent).toContain("Preview unavailable");
    expect(container.textContent).toContain("GitHub is busy right now.");
    const layout = await element(
      PreviewLayout({ slug: "demo", children: <p>child</p> }),
    );
    expect(layout.container.querySelector("nav")).toBeNull();
    expect(layout.container.textContent).toContain("child");
  });

  it("lists what stops docs that do not compile", async () => {
    mocks.load.mockResolvedValue({
      ok: true,
      preview: preview({
        content: null,
        readiness: {
          ready: false,
          pages: 0,
          assets: 0,
          problems: [
            {
              kind: "compile",
              file: "bad.md",
              message: "`<script>` elements aren't allowed",
            },
          ],
        },
      }),
    });
    const { container } = await element(
      PreviewPage({ slug: "demo", path: ["index"] }),
    );
    expect(container.textContent).toContain("don’t compile yet");
    expect(container.textContent).toContain("bad.md");
    expect(container.textContent).toContain("aren't allowed");
  });

  it("is a 404 before anything is loaded when the gate refuses", async () => {
    mocks.require.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
    await expect(
      element(PreviewPage({ slug: "demo", path: ["guide"] })),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.load).not.toHaveBeenCalled();
  });
});
