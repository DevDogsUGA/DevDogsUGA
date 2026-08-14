import { describe, expect, it } from "vitest";
import { audit, hasErrors, type AuditInput } from "./audit.js";

/**
 * Drift detection across four stores.
 *
 * The bug that matters is a FALSE CLEAN: a report that says nothing is wrong
 * while production authenticates with a credential nobody can see any more.
 * Every test here is a way that could happen, so each one asserts the finding
 * exists rather than asserting the shape of a passing run.
 */

const base: AuditInput = {
  local: new Map(),
  bws: new Map(),
  github: new Set(),
};

const run = (over: Partial<AuditInput>) => audit({ ...base, ...over });

describe("local vs Bitwarden", () => {
  it("flags a value that differs, as an error", () => {
    // The only value comparison this system can make anywhere. If it does not
    // fire, nothing else will.
    const findings = run({
      local: new Map([["DB_URL", "postgres://local"]]),
      bws: new Map([["DB_URL", "postgres://real"]]),
      github: new Set(["DB_URL"]),
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("error");
    expect(findings[0]!.summary).toMatch(/disagrees with Bitwarden/);
  });

  it("says nothing when the value matches", () => {
    const findings = run({
      local: new Map([["DB_URL", "same"]]),
      bws: new Map([["DB_URL", "same"]]),
      github: new Set(["DB_URL"]),
    });
    expect(findings).toEqual([]);
  });

  it("distinguishes a commented-out key from a missing one", () => {
    // Commented out is a deliberate local state; missing is an oversight. The
    // same severity for both trains people to ignore the category.
    const withComment = run({
      bws: new Map([["DISCORD_TOKEN", "x"]]),
      github: new Set(["DISCORD_TOKEN"]),
      localCommented: new Set(["DISCORD_TOKEN"]),
    });
    expect(withComment[0]!.severity).toBe("info");

    const without = run({
      bws: new Map([["DISCORD_TOKEN", "x"]]),
      github: new Set(["DISCORD_TOKEN"]),
    });
    expect(without[0]!.severity).toBe("warning");
  });

  it("flags a local-only value", () => {
    const findings = run({ local: new Map([["SCRATCH", "x"]]) });
    expect(findings[0]!.summary).toMatch(/not in Bitwarden/);
  });
});

describe("Bitwarden vs GitHub", () => {
  it("flags a secret the deploy cannot see, as an error", () => {
    // THE failure mode of the sync design: pushed to Bitwarden, never synced.
    // Everything looks healthy until the old credential is revoked.
    const findings = run({
      local: new Map([["CRON_SECRET", "x"]]),
      bws: new Map([["CRON_SECRET", "x"]]),
      github: new Set(),
    });
    expect(hasErrors(findings)).toBe(true);
    expect(findings[0]!.store).toBe("github");
    expect(findings[0]!.summary).toMatch(/deploy cannot see it/);
  });

  it("flags an orphan left in GitHub by a rename", () => {
    const findings = run({ github: new Set(["OLD_NAME"]) });
    expect(findings[0]!.severity).toBe("warning");
    expect(findings[0]!.summary).toMatch(/orphan/);
  });

  it("reports both directions at once rather than stopping at the first", () => {
    // A rename mid-flight: the new key is in Bitwarden and the local file but
    // not yet synced, and the old one is still sitting in GitHub. Both are
    // real, and a report that showed only one would have somebody fix half.
    const findings = run({
      local: new Map([["NEW_NAME", "x"]]),
      bws: new Map([["NEW_NAME", "x"]]),
      github: new Set(["OLD_NAME"]),
    }).filter((f) => f.store === "github");

    expect(findings.map((f) => f.key).sort()).toEqual(["NEW_NAME", "OLD_NAME"]);
    expect(findings.find((f) => f.key === "NEW_NAME")!.severity).toBe("error");
    expect(findings.find((f) => f.key === "OLD_NAME")!.severity).toBe(
      "warning",
    );
  });
});

describe("Cloudflare", () => {
  it("flags a Worker secret that no longer exists in Bitwarden", () => {
    // `--secrets-file` preserves what it omits, so a renamed variable leaves
    // its secret on the Worker indefinitely.
    const findings = run({
      cloudflare: new Map([["production-platform", new Set(["DROPPED_KEY"])]]),
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.store).toBe("cloudflare");
    expect(findings[0]!.summary).toMatch(/production-platform/);
  });

  it("does NOT flag a Bitwarden secret that is absent from a Worker", () => {
    // Asymmetric on purpose. DISCORD_TOKEN belongs to platform and to nothing
    // else, so "missing" from schedule-builder is correct, and reporting it
    // would bury the real orphans under noise.
    const findings = run({
      local: new Map([["DISCORD_TOKEN", "x"]]),
      bws: new Map([["DISCORD_TOKEN", "x"]]),
      github: new Set(["DISCORD_TOKEN"]),
      cloudflare: new Map([["staging-schedule-builder", new Set()]]),
    });
    expect(findings).toEqual([]);
  });

  it("names the worker, since the same key can be right on one and wrong on another", () => {
    const findings = run({
      cloudflare: new Map([
        ["staging-platform", new Set(["GHOST"])],
        ["staging-sandbox", new Set(["GHOST"])],
      ]),
    });
    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.summary).join(" ")).toContain(
      "staging-sandbox",
    );
  });
});

describe("ignored keys", () => {
  it("does not report keys that legitimately live elsewhere", () => {
    // Non-secrets are GitHub *variables*; the apply-only credentials belong to
    // production-apply. Reporting either as drift would make the audit cry
    // wolf on a correct configuration.
    const findings = run({
      local: new Map([["DEPLOY_ENV", "staging"]]),
      github: new Set(["AIRTABLE_APPLY_PAT"]),
      bws: new Map([["AIRTABLE_APPLY_PAT", "x"]]),
      ignore: new Set(["DEPLOY_ENV", "AIRTABLE_APPLY_PAT"]),
    });
    expect(findings).toEqual([]);
  });
});

describe("reporting", () => {
  it("puts errors before warnings before info", () => {
    const findings = run({
      local: new Map([["WRONG", "a"]]),
      bws: new Map([
        ["WRONG", "b"],
        ["QUIET", "x"],
      ]),
      github: new Set(["WRONG", "QUIET", "STRAY"]),
      localCommented: new Set(["QUIET"]),
    });
    expect(findings.map((f) => f.severity)).toEqual([
      "error",
      "warning",
      "info",
    ]);
  });

  it("treats an entirely empty world as clean", () => {
    // A first run, before anything exists. It must not invent findings.
    expect(run({})).toEqual([]);
    expect(hasErrors(run({}))).toBe(false);
  });
});
