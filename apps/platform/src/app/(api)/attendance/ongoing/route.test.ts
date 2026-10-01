import { beforeEach, describe, expect, it, vi } from "vitest";

const getAttendanceMeetings = vi.hoisted(() => vi.fn());
vi.mock("~/server/attendance/getMeetings", () => ({ getAttendanceMeetings }));

import { GET } from "./route";

const meeting = {
  id: "m1",
  nameOverride: "General body",
  kind: "general",
  startsAt: new Date(),
  endsAt: new Date(),
  surveyUrl: null,
};

function request(headers: Record<string, string> = {}) {
  return new Request("https://example.test/attendance/ongoing", { headers });
}

beforeEach(() => getAttendanceMeetings.mockReset());

describe("GET /attendance/ongoing", () => {
  it("returns the ongoing meeting with a short shared cache", async () => {
    getAttendanceMeetings.mockResolvedValue([
      { ...meeting, id: "past", ongoing: false },
      { ...meeting, ongoing: true },
    ]);
    const response = await GET(request({ "Sec-Fetch-Site": "same-origin" }));
    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=30, s-maxage=30",
    );
    expect(await response.json()).toEqual({
      meeting: { id: "m1", title: "General body" },
    });
  });

  it("returns null when nothing is running", async () => {
    getAttendanceMeetings.mockResolvedValue([{ ...meeting, ongoing: false }]);
    expect(await (await GET(request())).json()).toEqual({ meeting: null });
  });

  it("404s a navigation and a cross-site request without touching the db", async () => {
    const cases: Record<string, string>[] = [
      { "Sec-Fetch-Mode": "navigate" },
      { "Sec-Fetch-Dest": "document" },
      { "Sec-Fetch-Site": "cross-site" },
    ];
    for (const headers of cases) {
      const response = await GET(request(headers));
      expect(response.status).toBe(404);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    }
    expect(getAttendanceMeetings).not.toHaveBeenCalled();
  });
});
