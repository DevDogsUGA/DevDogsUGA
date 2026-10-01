import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  indexPages,
  loadIndexedPages,
  type IndexedPage,
  type IndexRpc,
} from "./search-index.js";

const page: IndexedPage = {
  path: "platform/index",
  title: "Platform",
  description: null,
  plainText: "text",
  publishAt: null,
};

function fakeClient(result: {
  data: boolean | null;
  error: { message: string } | null;
}) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { client: { rpc } as unknown as IndexRpc, rpc };
}

describe("indexPages", () => {
  it("sends the pages to replace_docs_index and reports a write", async () => {
    const { client, rpc } = fakeClient({ data: true, error: null });

    await expect(indexPages(client, [page])).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith("replace_docs_index", { pages: [page] });
  });

  it("reports false when the stored hash already matched", async () => {
    const { client } = fakeClient({ data: false, error: null });
    await expect(indexPages(client, [page])).resolves.toBe(false);
  });

  it("throws the database's message", async () => {
    const { client } = fakeClient({ data: null, error: { message: "boom" } });
    await expect(indexPages(client, [page])).rejects.toThrow("boom");
  });

  it("refuses to empty the index without calling the database", async () => {
    const { client, rpc } = fakeClient({ data: true, error: null });

    await expect(indexPages(client, [])).rejects.toThrow(/no pages/);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("loadIndexedPages", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-kit-index-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("keeps only the columns the index stores, defaulting the optional ones", async () => {
    fs.mkdirSync(path.join(root, "dist"));
    fs.writeFileSync(
      path.join(root, "dist", "index.js"),
      `export const pages = [{ path: "a/b", title: "T", plainText: "p", html: "<p>p</p>", headings: [] }];`,
    );

    await expect(loadIndexedPages(root)).resolves.toEqual([
      {
        path: "a/b",
        title: "T",
        description: null,
        plainText: "p",
        publishAt: null,
      },
    ]);
  });

  it("says to run codegen when there is no build", async () => {
    await expect(loadIndexedPages(root)).rejects.toThrow(/codegen/);
  });
});
