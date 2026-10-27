// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const authenticate = vi.hoisted(() => vi.fn());
vi.mock("~/server/auth", () => ({ authenticate }));

import { GET } from "./route";

function get(url: string, headers: Record<string, string> = {}) {
  const request = new Request(url, { headers });
  return GET(Object.assign(request, { nextUrl: new URL(url) }) as never);
}

beforeEach(() => {
  authenticate.mockReset();
  authenticate.mockResolvedValue(new Response(null, { status: 307 }));
});

describe("GET /auth", () => {
  it("starts OAuth immediately, toward the requested destination", async () => {
    await get(
      "https://example.test/auth?callbackPath=%2Fattendance%2Fcomplete",
    );
    expect(authenticate).toHaveBeenCalledWith("google", "/attendance/complete");
  });

  it("falls back to the homepage for an external or protocol-relative destination", async () => {
    await get(
      "https://example.test/auth?callbackPath=https%3A%2F%2Fevil.example",
    );
    await get("https://example.test/auth?callbackPath=%2F%2Fevil.example");
    expect(authenticate).toHaveBeenNthCalledWith(1, "google", "/");
    expect(authenticate).toHaveBeenNthCalledWith(2, "google", "/");
  });

  it("answers an RSC prefetch without starting a second handshake", async () => {
    const response = await get("https://example.test/auth", { RSC: "1" });
    expect(response.status).toBe(204);
    expect(authenticate).not.toHaveBeenCalled();
  });
});
