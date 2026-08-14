import { describe, expect, it } from "vitest";
import { fingerprint } from "./fingerprint.js";

describe("fingerprint", () => {
  it("says enough to spot a paste error and not enough to rebuild a secret", () => {
    expect(fingerprint("supersecrettoken")).toBe("16 chars, s…n");
    expect(fingerprint("")).toBe("empty");
    expect(fingerprint("abcd")).toBe("4 chars");
  });

  it("never contains the value", () => {
    // This output is designed to be pasted into a chat window.
    const secret = "sb_secret_N7UND0UgjKTVK";
    expect(fingerprint(secret)).not.toContain(secret.slice(0, 6));
  });

  it("distinguishes a rotation from an unchanged value", () => {
    // The reason it carries length AND ends: two tokens from the same issuer
    // share a prefix and a length, and only the tail separates them.
    expect(fingerprint("sb_secret_aaaaaaaa1")).not.toBe(
      fingerprint("sb_secret_aaaaaaaa2"),
    );
  });
});
