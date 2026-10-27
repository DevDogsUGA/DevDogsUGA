import { describe, expect, it } from "vitest";
import {
  logoLetter,
  logoUrl,
  parseScopes,
  returnHost,
  sharedFields,
} from "./consentScreen";

const ACCOUNT_RECORD =
  "Your whole account record: email, name and profile details, linked sign-in accounts, phone number and sign-in times";
const STORAGE = { baseUrl: "https://api.example.org", bucket: "avatars" };

describe("sharedFields", () => {
  it("always shares the member ID and nothing else for a bare openid scope", () => {
    expect(sharedFields("openid")).toEqual([
      "Your DevDogs member ID",
      ACCOUNT_RECORD,
    ]);
  });

  it("lists plain-language fields for openid email profile", () => {
    expect(sharedFields("openid email profile")).toEqual([
      "Your DevDogs member ID",
      "Your email address",
      "Your name and profile picture",
      "Your username, if you have one",
      "Other profile details saved on your account",
      ACCOUNT_RECORD,
    ]);
  });

  it("adds a phone number only for the phone scope", () => {
    expect(sharedFields("openid phone")).toContain("Your phone number");
    expect(sharedFields("openid email")).not.toContain("Your phone number");
  });

  it("ignores scopes it has no wording for and never duplicates", () => {
    expect(sharedFields("email email unknown")).toEqual([
      "Your DevDogs member ID",
      "Your email address",
      ACCOUNT_RECORD,
    ]);
  });
});

describe("parseScopes", () => {
  it("splits on spaces and commas", () => {
    expect(parseScopes("openid, email  profile")).toEqual([
      "openid",
      "email",
      "profile",
    ]);
  });
});

describe("returnHost", () => {
  it("is the host of the validated redirect address, port included", () => {
    expect(returnHost("https://dogdays.supabase.co/auth/v1/callback")).toBe(
      "dogdays.supabase.co",
    );
    expect(returnHost("http://localhost:54321/auth/v1/callback")).toBe(
      "localhost:54321",
    );
  });

  it("is null for nothing or nonsense", () => {
    expect(returnHost(null)).toBeNull();
    expect(returnHost("not a url")).toBeNull();
  });
});

describe("logoUrl", () => {
  it("points at our public storage", () => {
    expect(logoUrl("apps/abc.png", STORAGE)).toBe(
      "https://api.example.org/storage/v1/object/public/avatars/apps/abc.png",
    );
  });

  it("is null without a path, or with one that climbs out of the bucket", () => {
    expect(logoUrl(null, STORAGE)).toBeNull();
    expect(logoUrl("", STORAGE)).toBeNull();
    expect(logoUrl("../secret", STORAGE)).toBeNull();
    expect(logoUrl("/abs", STORAGE)).toBeNull();
  });

  it("encodes each segment", () => {
    expect(logoUrl("a b/c?d", STORAGE)).toContain("/a%20b/c%3Fd");
  });
});

describe("logoLetter", () => {
  it("is the first letter, capitalised", () => {
    expect(logoLetter("dogdays")).toBe("D");
    expect(logoLetter("  zed ")).toBe("Z");
    expect(logoLetter("")).toBe("?");
  });
});
