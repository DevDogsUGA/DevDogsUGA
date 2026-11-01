import { describe, expect, it } from "vitest";
import { buildConnectUrl } from "./connect-url.js";

describe("buildConnectUrl", () => {
  it("builds the connect URL with every required parameter", () => {
    const url = buildConnectUrl({
      platformUrl: "https://devdogsuga.org",
      redirectUri: "http://127.0.0.1:54123/callback",
      codeChallenge: "abc123",
      state: "xyz789",
      label: "my-project",
      callbackUri: "http://127.0.0.1:54321/auth/v1/callback",
    });
    const parsed = new URL(url);

    expect(parsed.origin).toBe("https://devdogsuga.org");
    expect(parsed.pathname).toBe("/oauth/connect");
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "http://127.0.0.1:54123/callback",
    );
    expect(parsed.searchParams.get("code_challenge")).toBe("abc123");
    expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
    expect(parsed.searchParams.get("state")).toBe("xyz789");
    expect(parsed.searchParams.get("label")).toBe("my-project");
    expect(parsed.searchParams.get("callback_uri")).toBe(
      "http://127.0.0.1:54321/auth/v1/callback",
    );
  });

  it("strips a trailing slash from the platform URL", () => {
    const url = buildConnectUrl({
      platformUrl: "https://devdogsuga.org/",
      redirectUri: "http://127.0.0.1:1/callback",
      codeChallenge: "c",
      state: "s",
      label: "l",
      callbackUri: "http://x/auth/v1/callback",
    });
    expect(url.startsWith("https://devdogsuga.org/oauth/connect?")).toBe(true);
  });

  it("truncates a label past 100 characters", () => {
    const url = buildConnectUrl({
      platformUrl: "https://devdogsuga.org",
      redirectUri: "http://127.0.0.1:1/callback",
      codeChallenge: "c",
      state: "s",
      label: "x".repeat(150),
      callbackUri: "http://x/auth/v1/callback",
    });
    const label = new URL(url).searchParams.get("label");
    expect(label).toHaveLength(100);
  });
});
