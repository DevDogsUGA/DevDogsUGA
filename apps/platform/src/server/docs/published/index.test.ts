import { beforeEach, describe, expect, it, vi } from "vitest";
import { DIGEST, OTHER_DIGEST, fakeBucket, publication } from "./fixtures";
import type { DocsBucket } from "./bucket";

const { cacheLife, bucketRef } = vi.hoisted(() => ({
  cacheLife: vi.fn(),
  bucketRef: { current: null as DocsBucket | null },
}));
vi.mock("next/cache", () => ({ cacheLife }));
vi.mock("./bucket", () => ({ docsBucket: () => bucketRef.current }));
vi.mock("@devdogsuga/docs", () => ({
  projects: [{ slug: "platform" }, { slug: "toolkit" }],
  pages: [],
  folders: [],
  variantGroups: {},
}));

import {
  getPublishedPointers,
  getPublishedProject,
  getPublishedSearchEntries,
} from "./index";

beforeEach(() => {
  cacheLife.mockClear();
  bucketRef.current = null;
});

describe("with no bucket binding", () => {
  it("publishes nothing, and does not hold that answer long", async () => {
    expect(await getPublishedProject("demo")).toBeNull();
    expect(await getPublishedPointers()).toEqual([]);
    expect(cacheLife).toHaveBeenCalledWith(
      expect.objectContaining({ expire: 30 }),
    );
  });

  it("has no search entries", async () => {
    expect(
      await getPublishedSearchEntries({
        project: "demo",
        digest: DIGEST,
      } as never),
    ).toEqual([]);
  });
});

describe("with a bucket", () => {
  it("loads the project the pointer names", async () => {
    bucketRef.current = fakeBucket(publication());
    const project = await getPublishedProject("demo");
    expect(project?.name).toBe("Demo");
    expect(project?.pointer.digest).toBe(DIGEST);
    expect([...project!.pages.keys()]).toEqual(["index", "guide/start"]);
  });

  it("keeps a version for good and a pointer for thirty seconds", async () => {
    bucketRef.current = fakeBucket(publication());
    await getPublishedProject("demo");
    expect(cacheLife).toHaveBeenCalledWith("max");
    expect(cacheLife).toHaveBeenCalledWith(
      expect.objectContaining({ revalidate: 30, expire: 30 }),
    );
  });

  it("follows the pointer to a new version", async () => {
    const both = {
      ...publication("demo", DIGEST),
      ...publication("demo", OTHER_DIGEST),
    };
    both["projects/demo/current.json"] = publication("demo", OTHER_DIGEST)[
      "projects/demo/current.json"
    ]!;
    bucketRef.current = fakeBucket(both);
    expect((await getPublishedProject("demo"))?.pointer.digest).toBe(
      OTHER_DIGEST,
    );
  });

  it("is null for an unpublished project, and for a slug that isn't one", async () => {
    bucketRef.current = fakeBucket(publication());
    expect(await getPublishedProject("other")).toBeNull();
    expect(await getPublishedProject("../demo")).toBeNull();
    expect(await getPublishedProject("DEMO")).toBeNull();
  });

  it("is null when the pointer names a version that isn't there", async () => {
    const objects = publication();
    delete objects[`projects/demo/versions/${DIGEST}/content.json`];
    bucketRef.current = fakeBucket(objects);
    expect(await getPublishedProject("demo")).toBeNull();
    expect(cacheLife).toHaveBeenLastCalledWith(
      expect.objectContaining({ expire: 30 }),
    );
  });

  it("never lets the bucket shadow a bundled project", async () => {
    bucketRef.current = fakeBucket({
      ...publication("demo"),
      ...publication("platform"),
    });
    expect(await getPublishedProject("platform")).toBeNull();
    expect((await getPublishedPointers()).map((p) => p.project)).toEqual([
      "demo",
    ]);
  });

  it("reads search entries once per version", async () => {
    const bucket = fakeBucket(publication());
    bucketRef.current = bucket;
    const [pointer] = await getPublishedPointers();
    const first = await getPublishedSearchEntries(pointer!);
    await getPublishedSearchEntries(pointer!);
    expect(first).toHaveLength(2);
    expect(bucket.reads.filter((k) => k.endsWith("search.json"))).toHaveLength(
      1,
    );
  });
});
