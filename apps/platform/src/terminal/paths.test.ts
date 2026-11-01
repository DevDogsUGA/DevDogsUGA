import { describe, expect, it } from "vitest";
import { matchTerminalPath, terminalFormat } from "./paths";

function request(
  path: string,
  headers: Record<string, string> = {},
  method = "GET",
) {
  return new Request(`https://devdogsuga.org${path}`, { headers, method });
}

describe("terminalFormat", () => {
  it("answers command-line clients", () => {
    expect(
      terminalFormat(
        request("/", { "user-agent": "curl/8.5.0", accept: "*/*" }),
      ),
    ).toBe("ansi");
    expect(terminalFormat(request("/", { "user-agent": "Wget/1.21.4" }))).toBe(
      "ansi",
    );
    expect(terminalFormat(request("/", { "user-agent": "HTTPie/3.2.2" }))).toBe(
      "ansi",
    );
  });

  it("leaves browsers, and curl asking for HTML, alone", () => {
    const firefox =
      "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0";
    expect(
      terminalFormat(
        request("/", { "user-agent": firefox, accept: "text/html" }),
      ),
    ).toBeNull();
    expect(
      terminalFormat(
        request("/", { "user-agent": "curl/8.5.0", accept: "text/html" }),
      ),
    ).toBeNull();
    expect(terminalFormat(request("/", {}))).toBeNull();
  });

  it("lets ?format decide", () => {
    expect(
      terminalFormat(request("/?format=txt", { "user-agent": "Mozilla/5.0" })),
    ).toBe("plain");
    expect(
      terminalFormat(request("/?format=ansi", { "user-agent": "Mozilla/5.0" })),
    ).toBe("ansi");
  });

  it("never touches writes", () => {
    expect(
      terminalFormat(request("/", { "user-agent": "curl/8.5.0" }, "POST")),
    ).toBeNull();
  });
});

describe("matchTerminalPath", () => {
  it.each([
    ["/", "/"],
    ["/oauth/connect", "/oauth/connect"],
    ["/oauth/device/", "/oauth/device"],
    ["/changelog/", "/changelog"],
    ["/changelog/3.0.2", "/changelog/:version"],
    ["/changelog/v3.0.2", "/changelog/:version"],
    ["/events/directions", "/events/directions"],
    ["/dashboard/apps/", "/dashboard/apps"],
    ["/events/2026-10-05-workshop", "/events/:slug"],
    ["/community/@sloan", "/community/:handle"],
    ["/docs/platform/getting-started/setup", "/docs/:project/*"],
    [
      "/dashboard/meetings/6f0c1b0e-0000-4000-8000-000000000001",
      "/dashboard/meetings/:meetingId",
    ],
    ["/dashboard/schedule", "/dashboard/schedule"],
    [
      "/dashboard/schedule/meeting/2026-10-05",
      "/dashboard/schedule/:collection/:key",
    ],
    ["/dashboard/schedule/venue/new", "/dashboard/schedule/:collection/:key"],
    ["/dashboard/badges", "/dashboard/badges"],
    [
      "/dashboard/badges/6f0c1b0e-0000-4000-8000-000000000001",
      "/dashboard/badges/:userId",
    ],
    ["/dashboard/projects", "/dashboard/projects"],
    [
      "/dashboard/projects/6f0c1b0e-0000-4000-8000-000000000001/report",
      "/dashboard/projects/:projectId/report",
    ],
    ["/dashboard/reviews", "/dashboard/reviews"],
    [
      "/dashboard/reviews/6f0c1b0e-0000-4000-8000-000000000001",
      "/dashboard/reviews/:projectId",
    ],
    ["/dashboard/data", "/dashboard/data"],
    ["/dashboard/data/imports/", "/dashboard/data/imports"],
    ["/dashboard/data/exports", "/dashboard/data/exports"],
    ["/dashboard/graphics", "/dashboard/graphics"],
    [
      "/dashboard/meetings/abc/graphics",
      "/dashboard/meetings/:meetingId/graphics",
    ],
    [
      "/dashboard/meetings/abc/present",
      "/dashboard/meetings/:meetingId/present",
    ],
    ["/dashboard/unknown", "/dashboard/*"],
    ["/dashboard", "/dashboard"],
  ])("%s is %s", (path, pattern) => {
    expect(matchTerminalPath(path)?.pattern).toBe(pattern);
  });

  it.each([
    "/events/calendar.ics",
    "/events/2026-10-05/calendar.ics",
    "/oauth/device/token",
    "/oauth/connect/exchange",
    "/attendance/claim",
    "/join",
    "/robots.txt",
    "/changlelog",
    "/dashboard/data/imports/preview",
    "/dashboard/data/exports/prepare",
    "/tools/oauth/device",
    "/teams",
  ])("passes %s through", (path) => {
    expect(matchTerminalPath(path)).toBeNull();
  });

  it("captures parameters", () => {
    expect(matchTerminalPath("/changelog/v3.0.2")?.params).toEqual({
      version: "3.0.2",
    });
    expect(matchTerminalPath("/events/abc")?.params).toEqual({ slug: "abc" });
  });
});
