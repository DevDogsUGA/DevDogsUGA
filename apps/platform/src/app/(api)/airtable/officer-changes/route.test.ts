import { describe, expect, it, vi } from "vitest";

vi.mock("~/env", () => ({
  env: { AIRTABLE_AUTOMATION_SECRET: "local-airtable-automation-secret" },
}));
vi.mock("~/server/airtable/credentials", () => ({
  getAirtableClient: vi.fn(),
}));
vi.mock("~/server/airtable/processOfficerChange", () => ({
  processOfficerChange: vi.fn(),
}));

import { POST } from "./route";

const URL = "https://devdogsuga.org/airtable/officer-changes";
const AUTH = { Authorization: "Bearer local-airtable-automation-secret" };

describe("Officer Changes automation route", () => {
  it("rejects requests without the dedicated bearer secret", async () => {
    const response = await POST(
      new Request(URL, { method: "POST", body: '{"recordId":"rec123"}' }),
    );
    expect(response.status).toBe(401);
  });

  it("rejects malformed input before contacting Airtable", async () => {
    const response = await POST(
      new Request(URL, { method: "POST", headers: AUTH, body: "{}" }),
    );
    expect(response.status).toBe(400);
  });

  it("bounds the automation request body", async () => {
    const response = await POST(
      new Request(URL, {
        method: "POST",
        headers: AUTH,
        body: "x".repeat(1_025),
      }),
    );
    expect(response.status).toBe(413);
  });
});
