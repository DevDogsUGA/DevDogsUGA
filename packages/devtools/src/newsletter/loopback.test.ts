import { describe, expect, it } from "vitest";
import { parseCallback, startLoopback } from "./loopback.js";

describe("parseCallback", () => {
  it("yields the code when path and state both match", () => {
    expect(parseCallback("/?code=1.AbcD&state=nonce", "nonce")).toEqual({
      code: "1.AbcD",
    });
  });

  it("treats a wrong or missing state as a stray, not a failure", () => {
    expect(parseCallback("/?code=1.AbcD&state=forged", "nonce")).toBeNull();
    expect(parseCallback("/?code=1.AbcD", "nonce")).toBeNull();
  });

  it("ignores requests off the callback path", () => {
    expect(parseCallback("/favicon.ico", "nonce")).toBeNull();
  });

  it("surfaces a declined sign-in as the error the page carried", () => {
    const result = parseCallback(
      "/?error=access_denied&error_description=AADSTS65004%3A+declined&state=nonce",
      "nonce",
    );
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toContain("AADSTS65004: declined");
  });
});

describe("startLoopback", () => {
  it("hands one code to the waiting flow and a page to the browser", async () => {
    const server = await startLoopback("nonce");
    try {
      const response = await fetch(
        `http://127.0.0.1:${server.port}/?code=1.AbcD&state=nonce`,
      );
      expect(response.status).toBe(200);
      expect(await response.text()).toContain("Signed in.");
      await expect(server.code).resolves.toBe("1.AbcD");
    } finally {
      server.close();
    }
  });

  it("404s strays and keeps waiting through a forged state", async () => {
    const server = await startLoopback("nonce");
    try {
      const stray = await fetch(`http://127.0.0.1:${server.port}/favicon.ico`);
      expect(stray.status).toBe(404);
      const forged = await fetch(
        `http://127.0.0.1:${server.port}/?code=evil&state=wrong`,
      );
      expect(forged.status).toBe(404);
      // Still listening: the real callback lands after the noise.
      await fetch(`http://127.0.0.1:${server.port}/?code=real&state=nonce`);
      await expect(server.code).resolves.toBe("real");
    } finally {
      server.close();
    }
  });

  it("rejects the flow when the identity page reports an error", async () => {
    const server = await startLoopback("nonce");
    try {
      const response = await fetch(
        `http://127.0.0.1:${server.port}/?error=access_denied&state=nonce`,
      );
      expect(await response.text()).toContain("did not go through");
      await expect(server.code).rejects.toThrow("access_denied");
    } finally {
      server.close();
    }
  });
});
