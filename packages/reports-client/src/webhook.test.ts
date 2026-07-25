import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseWebhookPayload, verifyWebhookSignature } from "./webhook.js";

function sign(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

describe("verifyWebhookSignature", () => {
  const secret = "test-secret";
  const body = JSON.stringify({ event: "report.resolved" });

  it("accepts a correctly signed body", () => {
    expect(verifyWebhookSignature(body, secret, sign(body, secret))).toBe(true);
  });

  it("rejects a tampered body", () => {
    expect(verifyWebhookSignature(`${body}x`, secret, sign(body, secret))).toBe(
      false,
    );
  });

  it("rejects the wrong secret", () => {
    expect(
      verifyWebhookSignature(body, "other-secret", sign(body, secret)),
    ).toBe(false);
  });

  it("rejects a signature without the sha256= prefix", () => {
    expect(verifyWebhookSignature(body, secret, "deadbeef")).toBe(false);
  });
});

describe("parseWebhookPayload", () => {
  const valid = {
    event: "report.resolved",
    reportId: "r1",
    reportedUserId: "u1",
    reporterUserId: "u2",
    contentId: "c1",
    subjectAction: "warned",
    filerAction: "none",
    contentAction: "removed",
    resolvedAt: new Date().toISOString(),
  };

  it("parses a complete payload", () => {
    expect(parseWebhookPayload(JSON.stringify(valid))).toMatchObject({
      reportId: "r1",
    });
  });

  it("throws on an unknown event", () => {
    expect(() =>
      parseWebhookPayload(JSON.stringify({ ...valid, event: "nope" })),
    ).toThrow();
  });

  it("throws when a required field is missing", () => {
    const { reportId: _omitted, ...rest } = valid;
    expect(() => parseWebhookPayload(JSON.stringify(rest))).toThrow(/reportId/);
  });
});
