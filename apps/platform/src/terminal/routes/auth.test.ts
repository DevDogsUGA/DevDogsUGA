// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
// The route table imports loaders that reach the database client.
vi.mock("server-only", () => ({}));
vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/env", () => ({ env: { BASE_URL: "http://localhost:3000" } }));

import { matchTerminalPath } from "../paths";
import { TERMINAL_ROUTES } from "../routes";

describe("/auth/failed terminal twin", () => {
  it("is routed", () => {
    expect(matchTerminalPath("/auth/failed")?.pattern).toBe("/auth/failed");
  });

  it("prints the reference for an unexpected failure and none for the rest", async () => {
    const route = TERMINAL_ROUTES["/auth/failed"];
    const render = async (query: string) =>
      JSON.stringify(
        await route.render({
          params: {},
          search: new URLSearchParams(query),
          path: "/auth/failed",
        }),
      );
    expect(await render("reason=unexpected&ref=SI-ABCDEFGH")).toContain(
      "SI-ABCDEFGH",
    );
    expect(await render("reason=wrong_account&ref=SI-ABCDEFGH")).not.toContain(
      "SI-ABCDEFGH",
    );
    expect(await render("reason=cancelled")).toContain("cancelled");
  });
});

// Consent identifiers and client details must never appear in terminal output.
it("routes consent to a browser notice without echoing authorization data", async () => {
  expect(matchTerminalPath("/oauth/consent")?.pattern).toBe("/oauth/consent");
  const result = JSON.stringify(
    await TERMINAL_ROUTES["/oauth/consent"].render({
      path: "/oauth/consent",
      params: {},
      search: new URLSearchParams("authorization_id=private-request"),
    }),
  );
  expect(result).toContain("OAuth consent lives in the browser");
  expect(result).not.toContain("private-request");
});
