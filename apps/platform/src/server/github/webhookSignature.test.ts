import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyGithubSignature } from "./webhookSignature";

/**
 * The signature check that stands between an anonymous POST and a mirror
 * write. `createHmac` from Node, not `verifyGithubSignature`'s own
 * `crypto.subtle` path, computes every expected header here -- a bug shared
 * between the signer and the verifier would otherwise pass its own test.
 */

function sign(secret: string, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

describe("verifyGithubSignature", () => {
  it("accepts a correctly signed body", async () => {
    const body = JSON.stringify({ action: "added" });
    const secret = "a-real-webhook-secret";
    expect(await verifyGithubSignature(secret, body, sign(secret, body))).toBe(
      true,
    );
  });

  it("rejects a body that does not match the signature", async () => {
    const secret = "a-real-webhook-secret";
    const header = sign(secret, JSON.stringify({ action: "added" }));
    expect(
      await verifyGithubSignature(
        secret,
        JSON.stringify({ action: "removed" }),
        header,
      ),
    ).toBe(false);
  });

  it("rejects the right body signed with the wrong secret", async () => {
    const body = JSON.stringify({ action: "added" });
    expect(
      await verifyGithubSignature(
        "the-real-secret",
        body,
        sign("an-attackers-guess", body),
      ),
    ).toBe(false);
  });

  it("rejects a missing header", async () => {
    expect(await verifyGithubSignature("secret", "{}", null)).toBe(false);
  });

  it("rejects a header without the sha256= prefix", async () => {
    const body = "{}";
    const raw = createHmac("sha256", "secret").update(body).digest("hex");
    expect(await verifyGithubSignature("secret", body, raw)).toBe(false);
  });
});
