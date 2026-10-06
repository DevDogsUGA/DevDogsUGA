import { describe, expect, it } from "vitest";
import {
  auditPatch,
  checkConsistency,
  compareVersions,
  findFixRelease,
  installedVersion,
  parsePatchedDependencies,
  parseUpstreamUrl,
  resolveUpstream,
  type FetchLike,
  type ManifestEntry,
  type UpstreamStatus,
} from "./patch-audit";

const yaml = `
catalog:
  react: ^19.2.8

patchedDependencies:
  # a comment
  '@vinext/cloudflare@1.0.1': patches/@vinext__cloudflare@1.0.1.patch
  react-dom@19.2.8: patches/react-dom@19.2.8.patch

other: true
`;

const entry = (overrides: Partial<ManifestEntry> = {}): ManifestEntry => ({
  file: "a@1.0.0.patch",
  why: "because",
  upstream: ["https://github.com/o/r/pull/1"],
  releasedIn: "pkg",
  ...overrides,
});

describe("parsePatchedDependencies", () => {
  it("reads quoted and bare keys and stops at the next top-level key", () => {
    expect(parsePatchedDependencies(yaml)).toEqual({
      "@vinext/cloudflare@1.0.1": "patches/@vinext__cloudflare@1.0.1.patch",
      "react-dom@19.2.8": "patches/react-dom@19.2.8.patch",
    });
  });
});

describe("checkConsistency", () => {
  const patched = { "a@1.0.0": "patches/a@1.0.0.patch" };
  const patchFiles = new Set(["a@1.0.0.patch", "patches.json"]);

  it("passes a matching manifest", () => {
    expect(
      checkConsistency({
        patched,
        manifest: { "a@1.0.0": entry() },
        patchFiles,
      }),
    ).toEqual([]);
  });

  it("flags keys missing on either side", () => {
    const errors = checkConsistency({
      patched,
      manifest: { "b@2.0.0": entry({ file: "a@1.0.0.patch" }) },
      patchFiles,
    });
    expect(errors.join("\n")).toContain(
      "a@1.0.0: in patchedDependencies but missing",
    );
    expect(errors.join("\n")).toContain(
      "b@2.0.0: in patches/patches.json but not in patchedDependencies",
    );
  });

  it("flags a missing file and a path mismatch", () => {
    const missing = checkConsistency({
      patched,
      manifest: { "a@1.0.0": entry({ file: "gone.patch" }) },
      patchFiles,
    });
    expect(missing.join("\n")).toContain("patches/gone.patch does not exist");
    expect(missing.join("\n")).toContain(
      "does not match patchedDependencies path",
    );
  });

  it("flags empty why, upstream, releasedIn and bad URLs", () => {
    const errors = checkConsistency({
      patched,
      manifest: {
        "a@1.0.0": entry({ why: " ", upstream: [], releasedIn: "" }),
      },
      patchFiles,
    });
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('"why" is empty'),
        expect.stringContaining('"releasedIn" is empty'),
        expect.stringContaining('"upstream" must list'),
      ]),
    );
    const bad = checkConsistency({
      patched,
      manifest: { "a@1.0.0": entry({ upstream: ["https://example.com/x"] }) },
      patchFiles,
    });
    expect(bad.join("\n")).toContain("not a GitHub PR or issue URL");
  });
});

describe("resolveUpstream", () => {
  const s = (resolved: boolean, date: string | null): UpstreamStatus => ({
    url: "u",
    resolved,
    date,
    state: resolved ? "merged" : "open",
  });

  it("needs every URL by default and dates by the last one", () => {
    expect(
      resolveUpstream([s(true, "2026-01-01T00:00:00Z"), s(false, null)], false),
    ).toEqual({
      resolved: false,
      resolvedAt: null,
    });
    expect(
      resolveUpstream(
        [s(true, "2026-01-01T00:00:00Z"), s(true, "2026-02-01T00:00:00Z")],
        false,
      ),
    ).toEqual({
      resolved: true,
      resolvedAt: "2026-02-01T00:00:00Z",
    });
  });

  it("needs one URL with anyOf and dates by the earliest", () => {
    expect(
      resolveUpstream(
        [s(true, "2026-03-01T00:00:00Z"), s(true, "2026-02-01T00:00:00Z")],
        true,
      ),
    ).toEqual({
      resolved: true,
      resolvedAt: "2026-02-01T00:00:00Z",
    });
    expect(
      resolveUpstream([s(false, null), s(false, null)], true).resolved,
    ).toBe(false);
  });
});

describe("versions", () => {
  it("compares stable versions numerically", () => {
    expect(compareVersions("1.10.0", "1.9.0")).toBeGreaterThan(0);
    expect(compareVersions("1.0.1", "1.0.1")).toBe(0);
  });

  it("picks the earliest stable release after resolution that is newer than installed", () => {
    const times = {
      "1.0.0": "2026-01-01T00:00:00Z",
      "1.0.1": "2026-02-01T00:00:00Z",
      "1.0.2": "2026-03-01T00:00:00Z",
      "1.1.0-beta.1": "2026-03-02T00:00:00Z",
      "1.1.0": "2026-04-01T00:00:00Z",
    };
    expect(findFixRelease(times, "1.0.1", "2026-02-15T00:00:00Z")).toBe(
      "1.0.2",
    );
    // Published after resolution but not newer than what we run.
    expect(findFixRelease(times, "1.1.0", "2026-02-15T00:00:00Z")).toBeNull();
    // Newer than installed but published before the fix landed.
    expect(findFixRelease(times, "1.0.0", "2026-05-01T00:00:00Z")).toBeNull();
  });

  it("reads the highest installed version from the lockfile, patch hashes included", () => {
    const lock = [
      "packages:",
      "  vinext@1.0.0:",
      "  vinext@1.0.1:",
      "  '@vinext/cloudflare@1.0.1(patch_hash=abc)(vinext@1.0.1)':",
      "  vinext-other@9.9.9:",
    ].join("\n");
    expect(installedVersion(lock, "vinext")).toBe("1.0.1");
    expect(installedVersion(lock, "@vinext/cloudflare")).toBe("1.0.1");
    expect(installedVersion(lock, "missing")).toBeNull();
  });
});

describe("parseUpstreamUrl", () => {
  it("tells PRs from issues", () => {
    expect(
      parseUpstreamUrl("https://github.com/cloudflare/vinext/pull/3242"),
    ).toMatchObject({ kind: "pr", number: 3242 });
    expect(
      parseUpstreamUrl("https://github.com/cloudflare/workerd/issues/6408"),
    ).toMatchObject({ kind: "issue" });
    expect(
      parseUpstreamUrl("https://github.com/cloudflare/workerd"),
    ).toBeNull();
  });
});

describe("auditPatch", () => {
  const lockfile = "packages:\n  pkg@1.0.0:\n";
  const reply = (body: unknown, status = 200) => ({
    ok: status < 400,
    status,
    json: async () => body,
  });

  function mockFetch(routes: Record<string, unknown | Error>): {
    fetch: FetchLike;
    calls: string[];
  } {
    const calls: string[] = [];
    const fetch: FetchLike = async (url) => {
      calls.push(url);
      const hit = Object.entries(routes).find(([fragment]) =>
        url.includes(fragment),
      );
      if (!hit) return reply({}, 404);
      if (hit[1] instanceof Error) throw hit[1];
      return reply(hit[1]);
    };
    return { fetch, calls };
  }

  it("is pending while the upstream PR is open, without touching npm", async () => {
    const { fetch, calls } = mockFetch({
      "/pulls/1": { state: "open", merged_at: null },
    });
    const report = await auditPatch("k", entry(), { fetch, lockfile });
    expect(report.state).toBe("pending");
    expect(calls.some((c) => c.includes("npmjs"))).toBe(false);
  });

  it("is awaiting-release when merged but nothing newer is published", async () => {
    const { fetch } = mockFetch({
      "/pulls/1": { state: "closed", merged_at: "2026-06-01T00:00:00Z" },
      "registry.npmjs.org/pkg": {
        time: { created: "x", modified: "y", "1.0.0": "2026-01-01T00:00:00Z" },
      },
    });
    expect((await auditPatch("k", entry(), { fetch, lockfile })).state).toBe(
      "awaiting-release",
    );
  });

  it("is removable, with an action, once a newer release follows the merge", async () => {
    const { fetch } = mockFetch({
      "/pulls/1": { state: "closed", merged_at: "2026-06-01T00:00:00Z" },
      "registry.npmjs.org/pkg": {
        time: {
          "1.0.0": "2026-01-01T00:00:00Z",
          "1.0.1": "2026-06-02T00:00:00Z",
        },
      },
    });
    const report = await auditPatch("k", entry(), { fetch, lockfile });
    expect(report.state).toBe("removable");
    expect(report.fixVersion).toBe("1.0.1");
    expect(report.action).toContain("bump pkg to 1.0.1");
  });

  it("honours anyOf across a PR and an issue", async () => {
    const routes = {
      "/pulls/1": { state: "open", merged_at: null },
      "/issues/2": { state: "closed", closed_at: "2026-06-01T00:00:00Z" },
      "registry.npmjs.org/pkg": {
        time: {
          "1.0.0": "2026-01-01T00:00:00Z",
          "1.0.1": "2026-06-02T00:00:00Z",
        },
      },
    };
    const upstream = [
      "https://github.com/o/r/pull/1",
      "https://github.com/o/r/issues/2",
    ];
    const all = await auditPatch("k", entry({ upstream }), {
      fetch: mockFetch(routes).fetch,
      lockfile,
    });
    expect(all.state).toBe("pending");
    const any = await auditPatch("k", entry({ upstream, anyOf: true }), {
      fetch: mockFetch(routes).fetch,
      lockfile,
    });
    expect(any.state).toBe("removable");
  });

  it("treats a closed-unmerged PR as unresolved", async () => {
    const { fetch } = mockFetch({
      "/pulls/1": { state: "closed", merged_at: null },
    });
    expect((await auditPatch("k", entry(), { fetch, lockfile })).state).toBe(
      "pending",
    );
  });

  it("turns network and API errors into warnings, never throws", async () => {
    const down = mockFetch({ "/pulls/1": new Error("offline") });
    const report = await auditPatch("k", entry(), {
      fetch: down.fetch,
      lockfile,
    });
    expect(report.state).toBe("unknown");
    expect(report.warnings.join()).toContain("offline");

    const npmDown = mockFetch({
      "/pulls/1": { state: "closed", merged_at: "2026-06-01T00:00:00Z" },
    });
    const second = await auditPatch("k", entry(), {
      fetch: npmDown.fetch,
      lockfile,
    });
    expect(second.state).toBe("unknown");
    expect(second.warnings.join()).toContain("npm");
  });

  it("sends the token as a bearer header when given", async () => {
    let seen: string | undefined;
    const fetch: FetchLike = async (_url, init) => {
      seen = init?.headers?.Authorization;
      return reply({ state: "open", merged_at: null });
    };
    await auditPatch("k", entry(), { fetch, lockfile, token: "t0ken" });
    expect(seen).toBe("Bearer t0ken");
  });
});
