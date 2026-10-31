import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LivePreview, PreviewLoad } from "~/server/docs/livePreview";

vi.mock("~/server/docs/livePreview", () => ({ livePreviews: vi.fn() }));

const { DocsReadinessView } = await import("./DocsReadiness");

afterEach(cleanup);

const SHA = "a1b2c3d".padEnd(40, "0");

const loaded = (readiness: LivePreview["readiness"]): PreviewLoad => ({
  ok: true,
  preview: {
    slug: "demo",
    repoId: "1",
    repository: "DevDogsUGA/demo",
    branch: "main",
    sha: SHA,
    readiness,
    content: null,
    assets: {},
  },
});

const view = (load: PreviewLoad) => render(<>{DocsReadinessView({ load })}</>);

describe("the docs check on the project page", () => {
  it("says ready, with what it counted and which commit it read", () => {
    view(loaded({ ready: true, problems: [], pages: 3, assets: 1 }));
    expect(screen.getByText("Ready to publish")).toBeTruthy();
    expect(screen.getByText("3 pages, 1 image")).toBeTruthy();
    const link = screen.getByRole("link", { name: "DevDogsUGA/demo@a1b2c3d" });
    expect(link.getAttribute("href")).toBe(
      `https://github.com/DevDogsUGA/demo/tree/${SHA}/docs`,
    );
    expect(screen.queryByText("Not ready")).toBeNull();
  });

  it("lists each problem with its file, and what the build would do about it", () => {
    view(
      loaded({
        ready: false,
        pages: 2,
        assets: 0,
        problems: [
          { kind: "link", file: "index.md:3", message: 'links to "./gone.md"' },
          { kind: "structure", file: null, message: "has no overview page" },
        ],
      }),
    );
    expect(screen.getByText("Not ready")).toBeTruthy();
    expect(screen.getByText(/2 problems/)).toBeTruthy();
    expect(screen.getByText("index.md:3")).toBeTruthy();
    expect(screen.getByText('links to "./gone.md"')).toBeTruthy();
    expect(screen.getByText("has no overview page")).toBeTruthy();
    expect(screen.queryByText("Ready to publish")).toBeNull();
  });

  it("lists twenty problems and counts the rest", () => {
    view(
      loaded({
        ready: false,
        pages: 0,
        assets: 0,
        problems: Array.from({ length: 23 }, (_, i) => ({
          kind: "link" as const,
          file: `p${i}.md`,
          message: "broken",
        })),
      }),
    );
    expect(screen.getAllByText("broken")).toHaveLength(20);
    expect(screen.getByText("and 3 more")).toBeTruthy();
    expect(screen.getByText(/23 problems/)).toBeTruthy();
  });

  it("says why it couldn't check when GitHub couldn't be read", () => {
    view({
      ok: false,
      failure: { kind: "busy", message: "GitHub is busy right now." },
    });
    expect(
      screen.getByText(/Couldn.t check the docs: GitHub is busy right now\./),
    ).toBeTruthy();
    expect(screen.queryByText("Ready to publish")).toBeNull();
  });
});
