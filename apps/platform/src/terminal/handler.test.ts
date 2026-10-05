// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { terminalResponse } from "./handler";

// The handler imports every route module, and through them the loaders and
// the database client. The gates under test stop before any of it runs.
vi.mock("server-only", () => ({}));
vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/env", () => ({ env: { BASE_URL: "http://localhost:3000" } }));

afterEach(() => {
  vi.unstubAllEnvs();
});

function get(path: string) {
  return terminalResponse(
    new Request(`https://devdogsuga.org/terminal${path}?format=txt`),
  );
}

describe("terminal gates in production", () => {
  it("redirects /community to the roster, as the page does", async () => {
    vi.stubEnv("DEPLOY_ENV", "production");
    const response = await get("/community");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/roster");
    expect(await response.text()).toContain("curl -L");
  });

  it("404s the profile pages", async () => {
    vi.stubEnv("DEPLOY_ENV", "production");
    expect((await get("/community/@someone")).status).toBe(404);
    expect((await get("/community/competitions")).status).toBe(404);
  });

  it("shows partners as under construction", async () => {
    vi.stubEnv("DEPLOY_ENV", "production");
    const response = await get("/partners");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Under construction");
  });
});

describe("terminal responses", () => {
  it("answers unknown paths with a terminal 404", async () => {
    const response = await get("/nope");
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe(
      "text/plain; charset=utf-8",
    );
    expect(await response.text()).toContain("No such page: /nope");
  });

  it("points browser-only pages at the browser", async () => {
    const text = await (await get("/teams/requests")).text();
    expect(text).toContain("https://devdogsuga.org/teams/requests");
  });

  it("serves the changelog without a database", async () => {
    const response = await get("/changelog");
    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain("\x1b");
  });
});
