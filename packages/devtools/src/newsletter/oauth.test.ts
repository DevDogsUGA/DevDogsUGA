import { describe, expect, it } from "vitest";
import { authorizeUrl, codeFromRedirect } from "./oauth.js";

describe("authorizeUrl", () => {
  it("asks for the IMAP and SMTP scopes as Thunderbird, hinting the mailbox", () => {
    const url = new URL(
      authorizeUrl("devdogs@uga.edu", "http://localhost:53682/", "nonce"),
    );
    expect(url.origin).toBe("https://login.microsoftonline.com");
    expect(url.searchParams.get("client_id")).toBe(
      "9e5f94bc-e8a4-4e73-b8be-63364c29d753",
    );
    expect(url.searchParams.get("scope")).toBe(
      "https://outlook.office365.com/IMAP.AccessAsUser.All https://outlook.office365.com/SMTP.Send offline_access",
    );
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:53682/",
    );
    expect(url.searchParams.get("login_hint")).toBe("devdogs@uga.edu");
    expect(url.searchParams.get("state")).toBe("nonce");
  });

  it("leaves state out of the pasted fallback, which cannot check it", () => {
    const url = new URL(authorizeUrl("devdogs@uga.edu", "https://localhost"));
    expect(url.searchParams.get("redirect_uri")).toBe("https://localhost");
    expect(url.searchParams.has("state")).toBe(false);
  });
});

describe("codeFromRedirect", () => {
  it("reads the code out of a pasted localhost address", () => {
    expect(
      codeFromRedirect(
        "https://localhost/?code=1.AbcD-efg_hij&session_state=deadbeef",
      ),
    ).toBe("1.AbcD-efg_hij");
  });

  it("accepts a bare code", () => {
    expect(codeFromRedirect("  1.AbcD-efg_hij  ")).toBe("1.AbcD-efg_hij");
  });

  it("surfaces the error the identity platform sent back", () => {
    const result = codeFromRedirect(
      "https://localhost/?error=access_denied&error_description=AADSTS65004%3A+declined+to+consent",
    );
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toContain("AADSTS65004: declined");
  });

  it("refuses input with no code in it, saying what to paste", () => {
    const result = codeFromRedirect("https://localhost/");
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toContain("address bar");
  });
});
