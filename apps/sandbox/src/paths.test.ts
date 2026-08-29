import { describe, expect, it } from "vitest";
import { classifyPath, usesRealtimeCarriers } from "./paths";

describe("classifyPath", () => {
  it("classifies each allowlisted service", () => {
    expect(classifyPath("/rest/v1/notes")).toBe("rest");
    expect(classifyPath("/auth/v1/token")).toBe("auth");
    expect(classifyPath("/storage/v1/object/public/b/f.png")).toBe("storage");
    expect(classifyPath("/realtime/v1/websocket")).toBe("realtime");
    expect(classifyPath("/functions/v1/hello")).toBe("functions");
  });

  it("classifies the bare service roots supabase-js hits", () => {
    expect(classifyPath("/rest/v1")).toBe("rest");
    expect(classifyPath("/rest/v1/")).toBe("rest");
  });

  it("refuses anything unmatched, including near-misses", () => {
    expect(classifyPath("/")).toBe("unknown");
    expect(classifyPath("/pg/query")).toBe("unknown");
    // The trailing slash in each prefix is what stops this matching `/rest`.
    expect(classifyPath("/restaurants")).toBe("unknown");
  });

  describe("percent-encoded traversal", () => {
    it("refuses an encoded escape from an allowed prefix", () => {
      // `new URL()` resolves `..` but does NOT decode, so this arrived intact
      // and `startsWith("/storage/v1/")` answered true -- the allowlist waving
      // through a path that names `/pg/query` to anything that decodes it.
      expect(classifyPath("/storage/v1/%2e%2e%2f%2e%2e%2fpg/query")).toBe(
        "unknown",
      );
      expect(classifyPath("/rest/v1/%2E%2E%2F%2E%2E%2Fpg/query")).toBe(
        "unknown",
      );
    });

    it("refuses an encoded hop between two allowed services", () => {
      // Storage on the way in, REST at the origin, and the audit row would have
      // said storage.
      expect(classifyPath("/storage/v1/%2e%2e%2f%2e%2e%2frest/v1/users")).toBe(
        "unknown",
      );
    });

    it("still allows an encoded separator that stays inside the prefix", () => {
      // The guard refuses only when decoding CHANGES the answer. A storage key
      // containing an encoded slash is legitimate and must keep working.
      expect(classifyPath("/storage/v1/object/public/bucket/a%2Fb.png")).toBe(
        "storage",
      );
      expect(classifyPath("/rest/v1/notes%2Ffoo")).toBe("rest");
    });

    it("refuses malformed percent-encoding rather than guessing", () => {
      expect(classifyPath("/rest/v1/%zz")).toBe("unknown");
      expect(classifyPath("/rest/v1/%")).toBe("unknown");
    });
  });
});

describe("usesRealtimeCarriers", () => {
  it("is realtime and nothing else", () => {
    expect(usesRealtimeCarriers("realtime")).toBe(true);
    for (const kind of [
      "rest",
      "auth",
      "storage",
      "functions",
      "unknown",
    ] as const) {
      expect(usesRealtimeCarriers(kind)).toBe(false);
    }
  });
});
