// @vitest-environment node
import { expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import * as Sentry from "@sentry/cloudflare";
import { deprecatedRoute } from "./deprecatedRoute";

vi.mock("@sentry/cloudflare", () => ({ captureMessage: vi.fn() }));

it("records the path and user agent while leaving POST credentials untouched", async () => {
  const handler = vi.fn(
    async (request: NextRequest) => new Response(await request.text()),
  );
  const request = new NextRequest(
    "https://devdogsuga.org/retired?code=private",
    {
      method: "POST",
      headers: { "user-agent": "installed-cli" },
      body: '{"code":"secret","code_verifier":"proof"}',
    },
  );
  const response = await deprecatedRoute(handler)(request);
  expect(handler).toHaveBeenCalledWith(request);
  expect(await response.text()).toBe(
    '{"code":"secret","code_verifier":"proof"}',
  );
  expect(Sentry.captureMessage).toHaveBeenCalledWith(
    "Deprecated CLI OAuth route",
    {
      level: "info",
      tags: { deprecated_route: "/retired", user_agent: "installed-cli" },
    },
  );
});
