import { describe, expect, it } from "vitest";
import { isValidRedirectUri, redirectUriError } from "./redirectRule";
import { ACCEPTED, REFUSED } from "./redirectRule.corpus";

describe("the redirect rule", () => {
  it.each(ACCEPTED)("accepts %s", (uri) => {
    expect(isValidRedirectUri(uri)).toBe(true);
    expect(redirectUriError(uri)).toBeNull();
  });

  it.each(REFUSED)("refuses %j", (uri) => {
    expect(isValidRedirectUri(uri)).toBe(false);
    expect(redirectUriError(uri)).toMatch(/Redirect URIs must be/);
  });

  it("allows http for exactly the three local hosts, on any port and path", () => {
    for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
      expect(isValidRedirectUri(`http://${host}`)).toBe(true);
      expect(isValidRedirectUri(`http://${host}:65535/a/b?c=d`)).toBe(true);
    }
  });

  it("refuses an address over 2048 characters", () => {
    expect(isValidRedirectUri(`https://example.com/${"a".repeat(2100)}`)).toBe(
      false,
    );
  });
});
