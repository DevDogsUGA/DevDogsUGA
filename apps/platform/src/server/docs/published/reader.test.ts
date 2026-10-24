import { describe, expect, it, vi } from "vitest";
import {
  DIGEST,
  content,
  fakeBucket,
  pointer,
  publication,
  searchEntries,
} from "./fixtures";
import {
  listPublishedPointers,
  readAsset,
  readContent,
  readPointer,
  readSearch,
} from "./reader";

describe("readPointer", () => {
  it("reads a valid pointer", async () => {
    const bucket = fakeBucket(publication());
    expect(await readPointer(bucket, "demo")).toEqual({
      status: "ok",
      pointer: pointer(),
    });
  });

  it("says missing when nothing is published", async () => {
    expect(await readPointer(fakeBucket({}), "demo")).toEqual({
      status: "missing",
    });
  });

  it("never asks the bucket about a slug that isn't one", async () => {
    const bucket = fakeBucket(publication());
    expect(await readPointer(bucket, "../demo")).toEqual({ status: "missing" });
    expect(await readPointer(bucket, "Demo")).toEqual({ status: "missing" });
    expect(bucket.reads).toEqual([]);
  });

  it.each([
    ["not JSON", "{nope"],
    ["wrong version", JSON.stringify({ ...pointer(), version: 2 })],
    ["a short digest", JSON.stringify({ ...pointer(), digest: "abc" })],
    ["another project's pointer", JSON.stringify(pointer("other"))],
    [
      "a different destination",
      JSON.stringify(pointer("demo", DIGEST, { destination: "/docs/x" })),
    ],
    ["an array", "[]"],
  ])("calls %s malformed", async (_name, body) => {
    const bucket = fakeBucket({ "projects/demo/current.json": body });
    expect(await readPointer(bucket, "demo")).toEqual({
      status: "malformed",
    });
  });

  it("refuses an oversized pointer without parsing it", async () => {
    const bucket = fakeBucket({
      "projects/demo/current.json": JSON.stringify({
        ...pointer(),
        repository: "x".repeat(40_000),
      }),
    });
    expect(await readPointer(bucket, "demo")).toEqual({
      status: "malformed",
    });
  });
});

describe("listPublishedPointers", () => {
  it("lists usable pointers, skipping reserved slugs and malformed ones", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bucket = fakeBucket({
      ...publication("demo"),
      ...publication("other"),
      ...publication("platform"),
      "projects/broken/current.json": "{",
      "projects/Bad_Slug/current.json": JSON.stringify(pointer()),
      "stray.txt": "x",
    });
    const found = await listPublishedPointers(bucket, new Set(["platform"]));
    expect(found.map((p) => p.project).sort()).toEqual(["demo", "other"]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("broken"));
    warn.mockRestore();
  });

  it("is empty for an empty bucket", async () => {
    expect(await listPublishedPointers(fakeBucket({}), new Set())).toEqual([]);
  });
});

describe("readContent", () => {
  it("reads a published version", async () => {
    const bucket = fakeBucket(publication());
    const read = await readContent(bucket, pointer());
    expect(read?.pages.map((p) => p.path)).toEqual([
      "demo/index",
      "demo/guide/start",
    ]);
  });

  it("is null when the version isn't there", async () => {
    expect(await readContent(fakeBucket({}), pointer())).toBeNull();
  });

  it("is null for a page outside the project, and says so", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const stray = content();
    stray.pages[0]!.path = "platform/index";
    const bucket = fakeBucket({
      [`projects/demo/versions/${DIGEST}/content.json`]: JSON.stringify(stray),
    });
    expect(await readContent(bucket, pointer())).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("is null for content that names another project", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bucket = fakeBucket({
      [`projects/demo/versions/${DIGEST}/content.json`]: JSON.stringify(
        content("other"),
      ),
    });
    expect(await readContent(bucket, pointer())).toBeNull();
    warn.mockRestore();
  });

  it("is null for content that isn't JSON", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bucket = fakeBucket({
      [`projects/demo/versions/${DIGEST}/content.json`]: "<html>",
    });
    expect(await readContent(bucket, pointer())).toBeNull();
    warn.mockRestore();
  });
});

describe("readSearch", () => {
  it("reads entries", async () => {
    expect(await readSearch(fakeBucket(publication()), pointer())).toEqual(
      searchEntries(),
    );
  });

  it("is null when missing or malformed", async () => {
    expect(await readSearch(fakeBucket({}), pointer())).toBeNull();
    const bad = fakeBucket({
      [`projects/demo/versions/${DIGEST}/search.json`]: '[{"path":1}]',
    });
    expect(await readSearch(bad, pointer())).toBeNull();
  });
});

describe("readAsset", () => {
  const bucket = fakeBucket(publication());

  it("serves an approved asset with a type from its extension", async () => {
    const asset = await readAsset(bucket, "demo", DIGEST, ["img", "shot.png"]);
    expect(asset?.type).toBe("image/png");
    expect(asset?.bytes.byteLength).toBe(4);
    expect((await readAsset(bucket, "demo", DIGEST, ["pic.svg"]))?.type).toBe(
      "image/svg+xml",
    );
  });

  it("refuses anything that isn't an image under assets/", async () => {
    expect(
      await readAsset(bucket, "demo", DIGEST, ["..", "content.json"]),
    ).toBeNull();
    expect(await readAsset(bucket, "demo", DIGEST, ["x.json"])).toBeNull();
    expect(await readAsset(bucket, "demo", DIGEST, [".hidden.png"])).toBeNull();
    expect(await readAsset(bucket, "demo", "short", ["pic.svg"])).toBeNull();
    expect(await readAsset(bucket, "De mo", DIGEST, ["pic.svg"])).toBeNull();
    expect(await readAsset(bucket, "demo", DIGEST, [])).toBeNull();
  });

  it("is null for an asset that isn't there", async () => {
    expect(await readAsset(bucket, "demo", DIGEST, ["nope.png"])).toBeNull();
  });
});
