import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PREVIEW_PORT,
  PREVIEW_URL,
  PREVIEW_WS_URL,
  checkPreviewServer,
  fetchFile,
} from "./client.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("preview client constants", () => {
  it("derives the URLs from the port", () => {
    expect(PREVIEW_URL).toBe(`http://localhost:${PREVIEW_PORT}`);
    expect(PREVIEW_WS_URL).toBe(`ws://localhost:${PREVIEW_PORT}/ws`);
  });
});

describe("checkPreviewServer", () => {
  it("returns true when the server responds ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("[]", { status: 200 })),
    );
    await expect(checkPreviewServer()).resolves.toBe(true);
  });

  it("returns false when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    );
    await expect(checkPreviewServer()).resolves.toBe(false);
  });
});

describe("fetchFile", () => {
  it("resolves null on a 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 404 })),
    );
    await expect(fetchFile("missing.md")).resolves.toBeNull();
  });

  it("returns the file text on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("# Hello", { status: 200 })),
    );
    await expect(fetchFile("readme.md")).resolves.toBe("# Hello");
  });
});
