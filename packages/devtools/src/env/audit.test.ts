import { describe, expect, it } from "vitest";
import {
  audit,
  hasErrors,
  type AuditInput,
  type BwsEntry,
  type GithubEntry,
} from "./audit.js";

/**
 * Drift detection across four stores.
 *
 * The bug that matters is a FALSE CLEAN: a report that says nothing is wrong
 * while production authenticates with a credential nobody can see any more.
 * Every test here is a way that could happen, so each one asserts the finding
 * exists rather than asserting the shape of a passing run.
 */

/** `{KEY: "value"}`, or `{KEY: ["value", revisionDate]}`. */
function bws(
  entries: Record<string, string | [string, string]>,
): Map<string, BwsEntry> {
  return new Map(
    Object.entries(entries).map(([key, v]) => [
      key,
      typeof v === "string"
        ? { value: v }
        : { value: v[0], revisionDate: v[1] },
    ]),
  );
}

function gh(
  name: string,
  updatedAt?: string,
  environment = "staging",
): GithubEntry {
  return { name, environment, updatedAt };
}

const base: AuditInput = {
  local: new Map(),
  bws: new Map(),
  github: [],
  route: () => "staging",
};

const run = (over: Partial<AuditInput>) => audit({ ...base, ...over });

describe("local vs Bitwarden", () => {
  it("flags a value that differs, as an error", () => {
    // The only value comparison this system can make anywhere. If it does not
    // fire, nothing else will.
    const findings = run({
      local: new Map([["DB_URL", "postgres://local"]]),
      bws: bws({ DB_URL: "postgres://real" }),
      github: [gh("DB_URL")],
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("error");
    expect(findings[0]!.summary).toMatch(/disagrees with Bitwarden/);
  });

  it("says nothing when the value matches", () => {
    const findings = run({
      local: new Map([["DB_URL", "same"]]),
      bws: bws({ DB_URL: "same" }),
      github: [gh("DB_URL")],
    });
    expect(findings).toEqual([]);
  });

  it("distinguishes a commented-out key from a missing one", () => {
    // Commented out is a deliberate local state; missing is an oversight. The
    // same severity for both trains people to ignore the category.
    const withComment = run({
      bws: bws({ DISCORD_TOKEN: "x" }),
      github: [gh("DISCORD_TOKEN")],
      localCommented: new Set(["DISCORD_TOKEN"]),
    });
    expect(withComment[0]!.severity).toBe("info");

    const without = run({
      bws: bws({ DISCORD_TOKEN: "x" }),
      github: [gh("DISCORD_TOKEN")],
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
      bws: bws({ CRON_SECRET: "x" }),
      github: [],
    });
    expect(hasErrors(findings)).toBe(true);
    expect(findings[0]!.store).toBe("github");
    expect(findings[0]!.summary).toMatch(/deploy cannot see it/);
    expect(findings[0]!.summary).toContain("staging");
  });

  it("flags an orphan left in GitHub by a rename", () => {
    const findings = run({ github: [gh("OLD_NAME")] });
    expect(findings[0]!.severity).toBe("warning");
    expect(findings[0]!.summary).toMatch(/orphan/);
  });

  it("reports both directions at once rather than stopping at the first", () => {
    // A rename mid-flight: the new key is in Bitwarden and the local file but
    // not yet synced, and the old one is still sitting in GitHub. Both are
    // real, and a report that showed only one would have somebody fix half.
    const findings = run({
      local: new Map([["NEW_NAME", "x"]]),
      bws: bws({ NEW_NAME: "x" }),
      github: [gh("OLD_NAME")],
    }).filter((f) => f.store === "github");

    expect(findings.map((f) => f.key).sort()).toEqual(["NEW_NAME", "OLD_NAME"]);
    expect(findings.find((f) => f.key === "NEW_NAME")!.severity).toBe("error");
    expect(findings.find((f) => f.key === "OLD_NAME")!.severity).toBe(
      "warning",
    );
  });
});

describe("staleness", () => {
  const ROTATED = "2026-08-13T12:00:00Z";
  const BEFORE = "2026-08-01T12:00:00Z";
  const AFTER = "2026-08-20T12:00:00Z";

  it("flags a rotation that was never propagated", () => {
    // The one thing presence cannot catch. Both stores have the key, the names
    // match, and production is authenticating with the old value.
    const findings = run({
      local: new Map([["DISCORD_TOKEN", "new"]]),
      bws: bws({ DISCORD_TOKEN: ["new", ROTATED] }),
      github: [gh("DISCORD_TOKEN", BEFORE)],
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("error");
    expect(findings[0]!.summary).toMatch(/still using the previous value/);
  });

  it("says nothing when GitHub was updated after the revision", () => {
    expect(
      run({
        local: new Map([["DISCORD_TOKEN", "new"]]),
        bws: bws({ DISCORD_TOKEN: ["new", ROTATED] }),
        github: [gh("DISCORD_TOKEN", AFTER)],
      }),
    ).toEqual([]);
  });

  it("treats an identical timestamp as current, not behind", () => {
    // A push immediately after an edit can land on the same second.
    expect(
      run({
        local: new Map([["K", "v"]]),
        bws: bws({ K: ["v", ROTATED] }),
        github: [gh("K", ROTATED)],
      }),
    ).toEqual([]);
  });

  it("treats an unknown or unparseable date as current, not stale", () => {
    // "Unknown means stale" turns one malformed timestamp into a report that
    // says everything is behind, after which nobody reads any of it.
    expect(
      run({
        local: new Map([["K", "v"]]),
        bws: bws({ K: "v" }), // no revisionDate at all
        github: [gh("K", BEFORE)],
      }),
    ).toEqual([]);

    expect(
      run({
        local: new Map([["K", "v"]]),
        bws: bws({ K: ["v", "not-a-date"] }),
        github: [gh("K", BEFORE)],
      }),
    ).toEqual([]);
  });
});

describe("routing between the two production environments", () => {
  const route = (key: string) =>
    key === "AIRTABLE_APPLY_PAT" ? "production-apply" : "production";

  it("flags an apply-only credential sitting in the unreviewed environment", () => {
    // The reviewer gate failing open. `production` deploys on a push with
    // nobody in front of it, so a write-capable token there makes
    // `production-apply` decorative -- and presence alone would call this fine,
    // because the name IS in GitHub.
    const findings = run({
      local: new Map([["AIRTABLE_APPLY_PAT", "x"]]),
      bws: bws({ AIRTABLE_APPLY_PAT: "x" }),
      github: [
        gh("AIRTABLE_APPLY_PAT", undefined, "production"),
        gh("AIRTABLE_APPLY_PAT", undefined, "production-apply"),
      ],
      route,
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("error");
    expect(findings[0]!.summary).toMatch(/not where it belongs/);
    expect(findings[0]!.summary).toContain("production");
  });

  it("is happy when each key is in its own environment", () => {
    expect(
      run({
        local: new Map([
          ["AIRTABLE_APPLY_PAT", "x"],
          ["DISCORD_TOKEN", "y"],
        ]),
        bws: bws({ AIRTABLE_APPLY_PAT: "x", DISCORD_TOKEN: "y" }),
        github: [
          gh("AIRTABLE_APPLY_PAT", undefined, "production-apply"),
          gh("DISCORD_TOKEN", undefined, "production"),
        ],
        route,
      }),
    ).toEqual([]);
  });

  it("does not mistake the right environment for a missing one", () => {
    // Two environments are queried at once for production. A key present only
    // in `production-apply` is CORRECT, and reporting it as absent from
    // `production` would make a healthy setup look broken.
    const findings = run({
      local: new Map([["AIRTABLE_APPLY_PAT", "x"]]),
      bws: bws({ AIRTABLE_APPLY_PAT: "x" }),
      github: [gh("AIRTABLE_APPLY_PAT", undefined, "production-apply")],
      route,
    });
    expect(findings).toEqual([]);
  });

  it("skips the GitHub axis for a key that belongs nowhere here", () => {
    // Pushing staging with a production-only credential in the file. It has no
    // home in the staging environment, and that is ordinary rather than wrong.
    const findings = run({
      local: new Map([["AIRTABLE_APPLY_PAT", "x"]]),
      bws: bws({ AIRTABLE_APPLY_PAT: "x" }),
      github: [],
      route: () => null,
    });
    expect(findings).toEqual([]);
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
      bws: bws({ DISCORD_TOKEN: "x" }),
      github: [gh("DISCORD_TOKEN")],
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
    // Non-secrets are GitHub *variables*. Reporting them as drift would make
    // the audit cry wolf on a correct configuration.
    const findings = run({
      local: new Map([["DEPLOY_ENV", "staging"]]),
      github: [gh("BASE_URL")],
      bws: bws({ BASE_URL: "x" }),
      ignore: new Set(["DEPLOY_ENV", "BASE_URL"]),
    });
    expect(findings).toEqual([]);
  });
});

describe("reporting", () => {
  it("puts errors before warnings before info", () => {
    const findings = run({
      local: new Map([["WRONG", "a"]]),
      bws: bws({ WRONG: "b", QUIET: "x" }),
      github: [gh("WRONG"), gh("QUIET"), gh("STRAY")],
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
