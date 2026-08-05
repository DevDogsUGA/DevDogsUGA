// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  buildProxyHostname,
  isValidProxyHostname,
  SANDBOX_SUFFIX,
} from "~/server/sandbox/hostname";
import { generateToken, hashToken, scopeOf } from "~/server/sandbox/tokens";
import { KeySelectionError, selectKeys } from "~/server/supabase/keys";
import { isGone, isReady, mapProjectStatus } from "~/server/supabase/status";

describe("selectKeys", () => {
  it("selects on type, not name, against the measured four-key response", () => {
    // The exact shape a fresh project returns: anon, service_role, and TWO
    // entries both literally named "default". Matching on the name picks a
    // deprecated key or is ambiguous depending on array order.
    const rows = [
      { type: "legacy", name: "anon", api_key: "eyJ-anon" },
      { type: "legacy", name: "service_role", api_key: "eyJ-service" },
      { type: "publishable", name: "default", api_key: "sb_publishable_x" },
      { type: "secret", name: "default", api_key: "sb_secret_y" },
    ];
    expect(selectKeys(rows)).toEqual({
      publishable: "sb_publishable_x",
      secret: "sb_secret_y",
    });
  });

  it("is order-independent", () => {
    const rows = [
      { type: "secret", name: "default", api_key: "sb_secret_y" },
      { type: "publishable", name: "default", api_key: "sb_publishable_x" },
      { type: "legacy", name: "anon", api_key: "eyJ-anon" },
    ];
    expect(selectKeys(rows).publishable).toBe("sb_publishable_x");
  });

  it("refuses to fall back to the legacy keys", () => {
    // They are documented as slated for removal in late 2026. Falling back
    // would mean an environment provisioned today stops working mid-semester
    // with no code change to blame.
    const legacyOnly = [
      { type: "legacy", name: "anon", api_key: "eyJ-anon" },
      { type: "legacy", name: "service_role", api_key: "eyJ-service" },
    ];
    expect(() => selectKeys(legacyOnly)).toThrow(KeySelectionError);
  });

  it("names which key was missing", () => {
    expect(() =>
      selectKeys([{ type: "publishable", api_key: "sb_publishable_x" }]),
    ).toThrow(/secret/);
  });
});

describe("mapProjectStatus", () => {
  it.each([
    ["ACTIVE_HEALTHY", "active"],
    ["INACTIVE", "paused"],
    ["COMING_UP", "restoring"],
    ["RESTORING", "restoring"],
  ] as const)("maps %s to %s", (upstream, expected) => {
    expect(mapProjectStatus(upstream)).toBe(expected);
  });

  it("treats a status it has never seen as not-ready", () => {
    // Erring toward not-ready costs a retry; erring toward ready means members
    // meet a broken instance during an event.
    expect(mapProjectStatus("SOME_FUTURE_STATE")).toBe("provisioning");
    expect(mapProjectStatus(null)).toBe("provisioning");
    expect(mapProjectStatus(undefined)).toBe("provisioning");
  });

  it("keeps a pausing project active until the pause lands", () => {
    // Pausing takes ~80s, measured. Treating it as paused immediately would
    // have the auto-pause job assume a slot is free before it is.
    expect(mapProjectStatus("PAUSING")).toBe("active");
  });

  it("never maps anything onto the platform's own three states", () => {
    const platformOnly = ["detached", "revoked", "orphaned"];
    const upstreamStatuses = [
      "ACTIVE_HEALTHY",
      "INACTIVE",
      "COMING_UP",
      "RESTORING",
      "PAUSING",
      "RESTARTING",
      "UPGRADING",
      "RESIZING",
      "INIT_FAILED",
      "UNKNOWN",
      "GOING_DOWN",
      "RESTORE_FAILED",
      "PAUSE_FAILED",
      "REMOVED",
      "ANYTHING",
    ];
    for (const status of upstreamStatuses) {
      expect(platformOnly).not.toContain(mapProjectStatus(status));
    }
  });

  it("only treats ACTIVE_HEALTHY as ready", () => {
    expect(isReady("ACTIVE_HEALTHY")).toBe(true);
    for (const other of ["COMING_UP", "RESTORING", "INACTIVE", "UNKNOWN"]) {
      expect(isReady(other)).toBe(false);
    }
  });

  it("keeps 'gone' out of the status mapping entirely", () => {
    // Orphaning deletes Vault secrets and revokes credentials, so it must
    // follow from a definite 404 in the nightly reconcile -- never from a
    // status string that happened to arrive during a blip.
    expect(isGone("REMOVED")).toBe(true);
    expect(mapProjectStatus("REMOVED")).toBe("provisioning");
    expect(isGone("INACTIVE")).toBe(false);
  });
});

describe("buildProxyHostname", () => {
  it("produces exactly one label above the apex", () => {
    const host = buildProxyHostname("Lantern", "abc123");
    expect(host).toBe("lantern-abc123-sandbox.devdogsuga.org");
    // The constraint that keeps it inside the free wildcard certificate.
    expect(host.slice(0, -SANDBOX_SUFFIX.length)).not.toContain(".");
  });

  it("strips anything that would add a level to the hostname", () => {
    const host = buildProxyHostname("team.evil.co", "abc123");
    expect(host.slice(0, -SANDBOX_SUFFIX.length)).not.toContain(".");
    expect(isValidProxyHostname(host)).toBe(true);
  });

  it.each([
    "Lantern",
    "  spaces  everywhere  ",
    "UPPER CASE",
    "emoji 🎉 name",
    "a".repeat(100),
    "-leading-and-trailing-",
    "café",
  ])("builds a legal label from %j", (name) => {
    expect(isValidProxyHostname(buildProxyHostname(name, "abc123"))).toBe(true);
  });

  it("falls back rather than emitting a label starting with a separator", () => {
    const host = buildProxyHostname("!!!", "abc123");
    expect(host).toBe("env-abc123-sandbox.devdogsuga.org");
    expect(isValidProxyHostname(host)).toBe(true);
  });

  it("is unguessable from the team name alone", () => {
    // Not collision avoidance -- the unique constraint handles that -- but so
    // that knowing a team exists does not tell you where its instance lives.
    const a = buildProxyHostname("Lantern");
    const b = buildProxyHostname("Lantern");
    expect(a).not.toBe(b);
  });

  it("rejects a hostname that would fall outside the wildcard", () => {
    expect(isValidProxyHostname("a.b-sandbox.devdogsuga.org")).toBe(false);
    expect(isValidProxyHostname("x-sandbox.example.com")).toBe(false);
    expect(isValidProxyHostname("-bad-sandbox.devdogsuga.org")).toBe(false);
  });
});

describe("member tokens", () => {
  it("carries the scope in a prefix mirroring upstream", () => {
    expect(generateToken("publishable")).toMatch(/^dd_publishable_/);
    expect(generateToken("secret")).toMatch(/^dd_secret_/);
  });

  it("round-trips through scopeOf", () => {
    for (const scope of ["publishable", "secret"] as const) {
      expect(scopeOf(generateToken(scope))).toBe(scope);
    }
  });

  it("does not mistake an upstream key for one of ours", () => {
    expect(scopeOf("sb_secret_REAL")).toBeNull();
    expect(scopeOf("eyJhbGciOiJIUzI1NiJ9.x.y")).toBeNull();
    expect(scopeOf("")).toBeNull();
  });

  it("is not guessable", () => {
    const seen = new Set(
      Array.from({ length: 200 }, () => generateToken("secret")),
    );
    expect(seen.size).toBe(200);
    // 32 bytes base64url ≈ 43 chars, plus the prefix.
    expect(generateToken("secret").length).toBeGreaterThan(50);
  });

  it("hashes to the same digest the Worker computes", async () => {
    // The platform stores the hash; the Worker computes it from the token a
    // member presents. If the two ever disagree, every credential silently
    // stops resolving, and the failure presents as "your token is wrong".
    //
    // Pinned to externally computed vectors rather than compared against the
    // Worker's implementation, so that changing BOTH in the same way still
    // fails here. These are plain `sha256(token)`, hex — reproducible with
    // `printf 'dd_secret_abc' | sha256sum`.
    expect(await hashToken("dd_publishable_test")).toBe(
      "030541452058b0bffaaf9bc47f056cb7ccef4daf00073a0fd5f953ec5f5d4f19",
    );
    expect(await hashToken("dd_secret_abc")).toBe(
      "ce9f617ceec0e557510ff5a1ccb1308560f926a711ab5ada6b7c20db6ff13db0",
    );
  });
});
