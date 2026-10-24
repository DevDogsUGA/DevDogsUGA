// @vitest-environment node
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
vi.mock("~/server/docs/published/bucket", () => ({
  docsBucket: () => bucketRef.current,
}));

import { GET } from "./route";

const get = (project: string, digest: string, ...path: string[]) =>
  GET(new Request("https://devdogsuga.org/docs-assets"), {
    params: Promise.resolve({ project, digest, path }),
  });

beforeEach(() => {
  bucketRef.current = fakeBucket(publication());
});

describe("GET /docs-assets", () => {
  it("serves an image locked down and cached for good", async () => {
    const response = await get("demo", DIGEST, "pic.svg");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/svg+xml");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toContain("immutable");
    const csp = response.headers.get("content-security-policy")!;
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("sandbox");
    expect(csp).not.toContain("script-src");
  });

  it("serves a nested image", async () => {
    const response = await get("demo", DIGEST, "img", "shot.png");
    expect(response.headers.get("content-type")).toBe("image/png");
  });

  it("404s everything else", async () => {
    for (const args of [
      ["demo", DIGEST, "missing.png"],
      ["demo", DIGEST, "..", "content.json"],
      ["demo", DIGEST, "content.json"],
      ["demo", DIGEST, "%E0%A4%A.png"],
      ["nobody", DIGEST, "pic.svg"],
      ["demo", "f".repeat(64), "pic.svg"],
    ] as const) {
      expect((await get(...args)).status, args.join("/")).toBe(404);
    }
  });

  it("404s without a bucket", async () => {
    bucketRef.current = null;
    expect((await get("demo", DIGEST, "pic.svg")).status).toBe(404);
  });
});
