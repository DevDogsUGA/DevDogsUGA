import { describe, expect, it } from "vitest";
import {
  PROFILE_LIMITS,
  isValidLinkUrl,
  linkTitleSchema,
  graduationSchema,
  validateBio,
  validateGraduation,
  validateLinkTitle,
  validateLinkUrl,
  validateLinks,
  validatePreferredName,
  validatePronouns,
} from "./profile";

/**
 * These rules are the reason a page-wide save can fan out to five different
 * writes without regularly ending up half applied, so they are worth pinning
 * down — particularly the two that mirror a database column, where the cost of
 * drifting is a write that passes validation and then fails at the insert.
 */

describe("validatePreferredName", () => {
  it("requires a name", () => {
    expect(validatePreferredName("")).not.toBeNull();
    expect(validatePreferredName("   ")).not.toBeNull();
  });

  it("accepts a normal name", () => {
    expect(validatePreferredName("Sloan F.")).toBeNull();
  });

  it("measures the trimmed value, not the typed one", () => {
    const atLimit = "a".repeat(PROFILE_LIMITS.preferredName);
    expect(validatePreferredName(`  ${atLimit}  `)).toBeNull();
    expect(validatePreferredName(`${atLimit}a`)).not.toBeNull();
  });
});

describe("validateBio", () => {
  // The limit is on the NORMALIZED value, and normalizing wraps to 63-column
  // lines — so the newlines it inserts count against the varchar(127) too. A
  // 127-character run with nowhere to break becomes three lines and 129
  // characters, and is refused. That is long-standing behaviour; this pins it
  // down because it is surprising enough to be "fixed" by accident.
  it("accepts text that normalizes to exactly the column width", () => {
    const twoFullLines = `${"a".repeat(63)} ${"b".repeat(63)}`;
    expect(twoFullLines).toHaveLength(PROFILE_LIMITS.shortText);
    expect(validateBio(twoFullLines)).toBeNull();
  });

  it("counts the newlines that wrapping introduces", () => {
    expect(validateBio("a".repeat(PROFILE_LIMITS.shortText))).not.toBeNull();
  });

  it("measures the normalized value", () => {
    // normalizeShortText collapses runs of spaces, so this is well under the
    // limit by the time it is written even though the raw string is over it.
    const spaced = "a b".padEnd(PROFILE_LIMITS.shortText + 40, " ");
    expect(validateBio(spaced)).toBeNull();
  });
});

describe("validatePronouns", () => {
  it("accepts a normal set", () => {
    expect(validatePronouns(["they", "them"])).toBeNull();
  });

  it("refuses more than the cap", () => {
    expect(
      validatePronouns(
        Array.from({ length: PROFILE_LIMITS.pronounCount + 1 }, (_, i) =>
          String(i),
        ),
      ),
    ).not.toBeNull();
  });

  it("refuses blanks, over-long entries and duplicates", () => {
    expect(validatePronouns([""])).not.toBeNull();
    expect(
      validatePronouns(["a".repeat(PROFILE_LIMITS.pronounChars + 1)]),
    ).not.toBeNull();
    expect(validatePronouns(["they", "they"])).not.toBeNull();
  });
});

describe("validateGraduation", () => {
  // Fixed so the suite does not start failing in May.
  const now = new Date("2026-08-26T12:00:00Z");

  it("allows the date to be cleared entirely", () => {
    expect(validateGraduation(null, null, now)).toBeNull();
    expect(validateGraduation("", null, now)).toBeNull();
  });

  it("refuses half a date", () => {
    expect(validateGraduation("spring", null, now)).not.toBeNull();
    expect(validateGraduation(null, 2027, now)).not.toBeNull();
  });

  it("refuses a semester that has already finished", () => {
    // August 2026: spring and summer 2026 are gone, fall is not.
    expect(validateGraduation("spring", 2026, now)).not.toBeNull();
    expect(validateGraduation("summer", 2026, now)).not.toBeNull();
    expect(validateGraduation("fall", 2026, now)).toBeNull();
  });

  it("accepts any semester in a later year", () => {
    expect(validateGraduation("spring", 2027, now)).toBeNull();
  });

  it("refuses an earlier year outright", () => {
    expect(validateGraduation("fall", 2025, now)).not.toBeNull();
  });
});

describe("isValidLinkUrl", () => {
  it("accepts http and https", () => {
    expect(isValidLinkUrl("https://example.com")).toBe(true);
    expect(isValidLinkUrl("http://example.com")).toBe(true);
  });

  it("refuses unparseable input", () => {
    expect(isValidLinkUrl("example.com")).toBe(false);
    expect(isValidLinkUrl("")).toBe(false);
  });

  it("refuses schemes that parse but are not links", () => {
    // `new URL()` is happy with all of these, which is why parsing alone is
    // not the check.
    expect(isValidLinkUrl("javascript:alert(1)")).toBe(false);
    expect(isValidLinkUrl("data:text/html,<h1>hi</h1>")).toBe(false);
    expect(isValidLinkUrl("mailto:someone@example.com")).toBe(false);
  });
});

describe("link limits match the database", () => {
  it("caps the title at the varchar(64) column width", () => {
    const atLimit = "a".repeat(PROFILE_LIMITS.linkTitle);
    expect(validateLinkTitle(atLimit)).toBeNull();
    expect(validateLinkTitle(`${atLimit}a`)).not.toBeNull();
  });

  it("refuses more than five links", () => {
    const link = { url: "https://example.com", title: "Example" };
    const atLimit = Array.from({ length: PROFILE_LIMITS.linkCount }, () => link);
    expect(validateLinks(atLimit)).toBeNull();
    expect(validateLinks([...atLimit, link])).not.toBeNull();
  });

  it("reports a bad URL inside the list", () => {
    expect(
      validateLinks([{ url: "not a url", title: null }]),
    ).not.toBeNull();
  });

  it("treats a missing title as empty rather than invalid", () => {
    expect(validateLinks([{ url: "https://example.com" }])).toBeNull();
  });
});

/**
 * The schemas exist so a server action refuses exactly what the field refuses.
 * These assert they are wired to the same validators rather than restating the
 * rules, which is the only failure mode worth catching here.
 */
describe("server schemas agree with the validators", () => {
  it("rejects an over-long link title with the validator's own message", () => {
    const tooLong = "a".repeat(PROFILE_LIMITS.linkTitle + 1);
    const parsed = linkTitleSchema.safeParse(tooLong);
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe(validateLinkTitle(tooLong));
  });

  it("rejects half a graduation date", () => {
    expect(
      graduationSchema.safeParse({ semester: "spring", year: null }).success,
    ).toBe(false);
    expect(
      graduationSchema.safeParse({ semester: null, year: null }).success,
    ).toBe(true);
  });

  it("shares the URL message between validator and field", () => {
    expect(validateLinkUrl("nope")).toBe("Enter a full http:// or https:// URL.");
  });
});
