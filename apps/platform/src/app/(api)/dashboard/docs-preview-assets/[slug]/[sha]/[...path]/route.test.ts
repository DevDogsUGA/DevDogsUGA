// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadCaller: vi.fn(),
  resolve: vi.fn(),
  load: vi.fn(),
  asset: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("~/server/auth/access", () => ({ loadCaller: mocks.loadCaller }));
vi.mock("~/server/docs/previewTarget", () => ({
  resolvePreviewTarget: mocks.resolve,
}));
vi.mock("~/server/docs/livePreview", () => ({
  livePreviews: () => ({ load: mocks.load, asset: mocks.asset }),
}));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  cache: <T>(fn: T) => fn,
}));
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));

import { GET } from "./route";

const SHA = "a".repeat(40);
const get = (slug = "demo", sha = SHA, ...path: string[]) =>
  GET(new Request("https://devdogsuga.org/dashboard/docs-preview-assets"), {
    params: Promise.resolve({
      slug,
      sha,
      path: path.length ? path : ["a.png"],
    }),
  });

const project = (over = {}) => ({
  slug: "demo",
  repoId: "1234",
  facts: { isOwner: true, isContributor: false, isReviewer: false, ...over },
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.loadCaller.mockResolvedValue({ userId: "u-1" });
  mocks.resolve.mockResolvedValue(project());
  mocks.load.mockResolvedValue({ ok: true, preview: { sha: SHA } });
  mocks.asset.mockResolvedValue({
    bytes: new Uint8Array([1, 2, 3]),
    type: "image/png",
  });
});

describe("GET /dashboard/docs-preview-assets", () => {
  it("serves an image the preview approved, locked down and private", async () => {
    const response = await get("demo", SHA, "img", "a.png");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).not.toContain("immutable");
    const csp = response.headers.get("content-security-policy")!;
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("sandbox");
    expect(mocks.load).toHaveBeenCalledWith(
      { slug: "demo", repoId: "1234" },
      SHA,
    );
    expect(mocks.asset).toHaveBeenCalledWith({ sha: SHA }, "img/a.png");
  });

  it("is a 404 for a signed-out visitor, and one who may not preview the project", async () => {
    mocks.loadCaller.mockResolvedValue(null);
    expect((await get()).status).toBe(404);
    mocks.loadCaller.mockResolvedValue({ userId: "u-2" });
    mocks.resolve.mockResolvedValue(
      project({ isOwner: false, isContributor: false, isReviewer: false }),
    );
    expect((await get()).status).toBe(404);
    expect(mocks.load).not.toHaveBeenCalled();
    mocks.resolve.mockResolvedValue(null);
    expect((await get()).status).toBe(404);
  });

  it("is a 404 for a path the preview did not approve, a preview that did not load, and a bad path", async () => {
    mocks.asset.mockResolvedValue(null);
    expect((await get()).status).toBe(404);
    mocks.load.mockResolvedValue({ ok: false, failure: { kind: "busy" } });
    expect((await get()).status).toBe(404);
    expect((await get("demo", SHA, "%E0%A4%A")).status).toBe(404);
  });
});
