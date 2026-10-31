// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBucket, publication } from "~/server/docs/published/fixtures";
import type { DocsBucket } from "~/server/docs/published/bucket";
import { terminalResponse } from "./handler";

const { bucketRef, contributeRows } = vi.hoisted(() => ({
  bucketRef: { current: null as DocsBucket | null },
  contributeRows: { current: [] as unknown[] },
}));
vi.mock("next/cache", () => ({ cacheLife: vi.fn() }));
vi.mock("~/server/docs/published/bucket", () => ({
  docsBucket: () => bucketRef.current,
}));
vi.mock("~/server/docs/contribute", () => ({
  PLATFORM_SLUG: "platform",
  getContributeProjects: async () => contributeRows.current,
}));
vi.mock("server-only", () => ({}));
vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/env", () => ({ env: { BASE_URL: "http://localhost:3000" } }));

const get = (path: string) =>
  terminalResponse(
    new Request(`https://devdogsuga.org/terminal${path}?format=txt`),
  );

beforeEach(() => {
  bucketRef.current = fakeBucket(publication());
  contributeRows.current = [];
});

describe("the terminal twin of a published project", () => {
  it("lists the project's pages with their paths", async () => {
    const response = await get("/docs/demo");
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain("A demo project.");
    expect(text).toContain("Guide");
    expect(text).toContain("curl devdogsuga.org/docs/demo/guide");
  });

  it("prints a page's title, description, text and its browser URL", async () => {
    const text = await (await get("/docs/demo/guide/start")).text();
    expect(text).toContain("Start here");
    expect(text).toContain("Install the thing & <run> it.");
    expect(text).toContain("https://devdogsuga.org/docs/demo/guide/start");
  });

  it("follows a folder to its listing and 404s a page that isn't there", async () => {
    expect((await get("/docs/demo/guide")).status).toBe(200);
    expect((await get("/docs/demo/missing")).status).toBe(404);
  });

  it("keeps answering an unpublished slug with the project list", async () => {
    bucketRef.current = null;
    const response = await get("/docs/demo");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("The docs live in the browser");
  });
});

describe("the terminal twin of /docs", () => {
  it("lists the two menus: Docs, then Contribute with each project named by its own row", async () => {
    contributeRows.current = [
      {
        slug: "platform",
        name: "DevDogs Platform",
        tagline: "Member Portal and Dev Tools",
        description: null,
        iconKey: "HouseIcon",
        colorKey: "cyan-400",
      },
    ];
    const text = await (await get("/docs")).text();
    const docs = text.indexOf("docs\n");
    const contribute = text.indexOf("contribute\n");
    expect(docs).toBeGreaterThan(-1);
    expect(contribute).toBeGreaterThan(docs);

    const docsPart = text.slice(docs, contribute);
    expect(docsPart).toContain("Workshops");
    expect(docsPart).toContain("Sign in with DevDogs");
    expect(docsPart).toContain("/docs/platform/guides/moderation");
    expect(docsPart).not.toContain("DevDogs Platform");

    const contributePart = text.slice(contribute);
    expect(contributePart).toContain("DevDogs Platform");
    expect(contributePart).toContain("Member Portal and Dev Tools");
    expect(contributePart).toContain("/docs/platform");
    expect(contributePart).not.toContain("Workshops");
  });
});
