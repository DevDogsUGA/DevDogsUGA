import { describe, expect, it } from "vitest";
import { generateNonce } from "./nonce.js";

describe("generateNonce", () => {
  it("returns a base64 string decoding to 16 bytes (128 bits)", () => {
    const nonce = generateNonce();
    expect(nonce).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(atob(nonce)).toHaveLength(16);
  });

  it("is different on every call", () => {
    const a = generateNonce();
    const b = generateNonce();
    expect(a).not.toBe(b);
  });

  it("contains no CSP-escape-triggering characters (&, <, >, line/paragraph separators)", () => {
    // vinext's own nonce parser (`getScriptNonceFromHeader`) throws if the
    // nonce it reads back off the header contains any of these -- matches
    // its `ESCAPE_REGEX`, and base64's alphabet can never produce them, but
    // this guards the contract explicitly rather than by construction alone.
    const nonce = generateNonce();
    expect(nonce).not.toMatch(/[&><\u2028\u2029]/);
  });
});
