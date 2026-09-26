import { describe, expect, it, vi } from "vitest";

// Only the pure crypto/normalization helpers are exercised below --
// `sweepExpiredDeviceCodes` needs a real database and is covered by
// `route.db-test.ts` instead -- but importing this module at all pulls in
// `~/server/db`, which throws at import time without real Supabase env vars
// (see `~/server/rateLimit.test.ts` for the same mock, for the same reason).
vi.mock("~/server/db", () => ({ db: { delete: vi.fn() } }));

import {
  formatUserCode,
  generateDeviceCode,
  generateRawUserCode,
  hashDeviceCode,
  hashUserCode,
  normalizeUserCode,
} from "./deviceCodes";

const USER_CODE_ALPHABET = "BCDFGHJKLMNPQRSTVWXZ";

describe("generateDeviceCode", () => {
  it("returns a base64url code at least 32 bytes long and its matching hash", () => {
    const { code, codeHash } = generateDeviceCode();
    // base64url of 32 bytes is 43 characters, no padding.
    expect(code.length).toBeGreaterThanOrEqual(43);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(codeHash).toBe(hashDeviceCode(code));
  });

  it("never repeats across calls", () => {
    const a = generateDeviceCode();
    const b = generateDeviceCode();
    expect(a.code).not.toBe(b.code);
  });
});

describe("hashDeviceCode", () => {
  it("is deterministic and sha256 hex-encoded (64 hex chars)", () => {
    const hash = hashDeviceCode("some-code");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hashDeviceCode("some-code")).toBe(hash);
  });
});

describe("generateRawUserCode", () => {
  it("returns exactly 8 characters, all from the RFC 8628 alphabet", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateRawUserCode();
      expect(code).toHaveLength(8);
      for (const char of code) {
        expect(USER_CODE_ALPHABET.includes(char)).toBe(true);
      }
    }
  });

  it("excludes vowels, Y, and digits (RFC 8628 §6.1's ambiguity trims)", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateRawUserCode();
      expect(code).not.toMatch(/[AEIOUY0-9]/i);
    }
  });
});

describe("normalizeUserCode", () => {
  it("uppercases, strips spaces and dashes", () => {
    expect(normalizeUserCode("bcdf-ghjk")).toBe("BCDFGHJK");
    expect(normalizeUserCode("BCDF GHJK")).toBe("BCDFGHJK");
    expect(normalizeUserCode("bcdfghjk")).toBe("BCDFGHJK");
    expect(normalizeUserCode("BCDF-GHJK")).toBe("BCDFGHJK");
  });

  it("rejects a code that isn't 8 alphabet characters after stripping", () => {
    expect(normalizeUserCode("BCDF-GHJ")).toBeNull();
    expect(normalizeUserCode("BCDF-GHJKL")).toBeNull();
    expect(normalizeUserCode("")).toBeNull();
  });

  it("rejects characters outside the alphabet, including ambiguous ones", () => {
    expect(normalizeUserCode("AAAA-AAAA")).toBeNull(); // A is not in the alphabet
    expect(normalizeUserCode("0000-0000")).toBeNull();
    expect(normalizeUserCode("IIII-IIII")).toBeNull();
  });
});

describe("formatUserCode", () => {
  it("inserts a dash after the fourth character", () => {
    expect(formatUserCode("BCDFGHJK")).toBe("BCDF-GHJK");
  });
});

describe("hashUserCode", () => {
  it("is deterministic and sha256 hex-encoded", () => {
    const hash = hashUserCode("BCDFGHJK");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hashUserCode("BCDFGHJK")).toBe(hash);
  });

  it("hashes different normalized codes differently", () => {
    expect(hashUserCode("BCDFGHJK")).not.toBe(hashUserCode("BCDFGHJL"));
  });
});
