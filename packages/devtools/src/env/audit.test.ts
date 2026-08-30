import { describe, expect, it } from "vitest";
import {
  audit,
  hasErrors,
  type AuditInput,
  type BwsEntry,
  type GithubEntry,
  type GithubVariableEntry,
  type RepositoryVariableScan,
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

/** A GitHub *variable*, which unlike a secret carries its value. */
function ghVar(
  name: string,
  value: string,
  environment = "staging",
  updatedAt?: string,
): GithubVariableEntry {
  return { name, value, environment, updatedAt };
}

const base: AuditInput = {
  local: new Map(),
  bws: new Map(),
  github: [],
  route: () => "staging",
};

const run = (over: Partial<AuditInput>) => audit({ ...base, ...over });

describe("undeclared keys", () => {
  it("reports them as their own category, not as drift", () => {
    // The fix is a define() in a manifest, not a push, so the ordinary
    // "in your .env, not in Bitwarden" warning must not fire alongside it,
    // or the reader is told pushing would help when push skips the key.
    const findings = run({
      local: new Map([["MYSTERY_KEY", "x"]]),
      declared: new Set(["DB_URL"]),
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("warning");
    expect(findings[0]!.summary).toMatch(/declared in no env manifest/);
  });

  it("stays quiet when the declared set is not provided", () => {
    // Callers without a loaded registry get the old behaviour rather than
    // every key suddenly reading as undeclared.
    const findings = run({
      local: new Map([["MYSTERY_KEY", "x"]]),
      bws: bws({ MYSTERY_KEY: "x" }),
      github: [gh("MYSTERY_KEY")],
    });
    expect(findings).toEqual([]);
  });

  it("does not hide a declared key's drift", () => {
    const findings = run({
      local: new Map([["DB_URL", "local"]]),
      bws: bws({ DB_URL: "real" }),
      github: [gh("DB_URL")],
      declared: new Set(["DB_URL"]),
    });
    expect(findings.some((f) => /disagrees/.test(f.summary))).toBe(true);
  });
});

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

  // ── the fan-out, since production-apply became a superset ──────────────────
  //
  // `env push --target production` now writes most keys to BOTH environments,
  // so `route` alone stopped being able to answer "is this copy misplaced?".
  // `accepted` answers it, and getting this wrong is not a cosmetic problem:
  // 46 spurious "delete it there" errors on every audit is how a reviewer
  // learns to skim the one finding that catches the reviewer gate failing open.
  describe("a second copy in the reviewed environment", () => {
    // What `runEnvAudit` passes: the routing's own `accepts()`, which takes
    // everything in `production-apply` and refuses the apply pair in
    // `production`.
    const accepted = (key: string, environment: string) =>
      environment === "production-apply" || key !== "AIRTABLE_APPLY_PAT";

    it("is not a stray, because the push put it there", () => {
      expect(
        run({
          local: new Map([["DISCORD_TOKEN", "y"]]),
          bws: bws({ DISCORD_TOKEN: "y" }),
          github: [
            gh("DISCORD_TOKEN", undefined, "production"),
            gh("DISCORD_TOKEN", undefined, "production-apply"),
          ],
          route,
          accepted,
        }),
      ).toEqual([]);
    });

    it("⚠️ STILL flags the apply key in the unreviewed environment", () => {
      // The finding the loosening must not swallow, and the reason `accepted`
      // is a predicate rather than "anything in this project is fine". Same
      // inputs as the test above but for the key, so a pass here is about the
      // KEY rather than about the audit having gone quiet.
      const findings = run({
        local: new Map([["AIRTABLE_APPLY_PAT", "x"]]),
        bws: bws({ AIRTABLE_APPLY_PAT: "x" }),
        github: [
          gh("AIRTABLE_APPLY_PAT", undefined, "production"),
          gh("AIRTABLE_APPLY_PAT", undefined, "production-apply"),
        ],
        route,
        accepted,
      });
      expect(findings).toHaveLength(1);
      expect(findings[0]!.severity).toBe("error");
      expect(findings[0]!.summary).toMatch(/not where it belongs/);
    });

    it("keeps the strict answer for a caller that passes no predicate", () => {
      // The default. A caller that has not thought about fan-out gets the old
      // behaviour rather than silence, which is why the first test in this
      // block passes `accepted` explicitly and this one does not.
      const findings = run({
        local: new Map([["DISCORD_TOKEN", "y"]]),
        bws: bws({ DISCORD_TOKEN: "y" }),
        github: [
          gh("DISCORD_TOKEN", undefined, "production"),
          gh("DISCORD_TOKEN", undefined, "production-apply"),
        ],
        route,
      });
      expect(findings).toHaveLength(1);
      expect(findings[0]!.summary).toMatch(/not where it belongs/);
    });
  });
});

describe("credentials that must never be stored remotely", () => {
  // BWS_ACCESS_TOKEN unlocks all three Bitwarden projects. Stored in one it is
  // a key locked inside the box it opens; in GitHub it would hand CI every
  // secret we have. Being in the local .env and NOWHERE else is correct.
  const never = new Set(["BWS_ACCESS_TOKEN"]);

  it("says nothing when it is local-only, which is the correct state", () => {
    // The one that must not cry wolf. This is what a healthy machine looks
    // like, and a warning here would train people to ignore the category.
    expect(
      run({
        local: new Map([["BWS_ACCESS_TOKEN", "0.abc"]]),
        neverStore: never,
      }),
    ).toEqual([]);
  });

  it("errors when it reached Bitwarden", () => {
    const findings = run({
      local: new Map([["BWS_ACCESS_TOKEN", "0.abc"]]),
      bws: bws({ BWS_ACCESS_TOKEN: "0.abc" }),
      neverStore: never,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("error");
    expect(findings[0]!.summary).toMatch(/NEVER be stored in Bitwarden/);
  });

  it("errors when it reached GitHub, naming the environment", () => {
    const findings = run({
      github: [gh("BWS_ACCESS_TOKEN", undefined, "production")],
      neverStore: never,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("error");
    expect(findings[0]!.summary).toContain("production");
  });

  it("errors when it reached a Worker", () => {
    const findings = run({
      cloudflare: new Map([
        ["production-platform", new Set(["BWS_ACCESS_TOKEN"])],
      ]),
      neverStore: never,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.store).toBe("cloudflare");
  });

  it("reports every store it leaked into, not just the first", () => {
    // Once it is in Bitwarden, a push spreads it onward. Fixing one and
    // believing you were done is the failure worth preventing.
    const findings = run({
      bws: bws({ BWS_ACCESS_TOKEN: "0.abc" }),
      github: [gh("BWS_ACCESS_TOKEN", undefined, "staging")],
      cloudflare: new Map([
        ["staging-platform", new Set(["BWS_ACCESS_TOKEN"])],
      ]),
      neverStore: never,
    });
    expect(findings).toHaveLength(3);
    expect(findings.every((f) => f.severity === "error")).toBe(true);
    expect(findings.map((f) => f.store).sort()).toEqual([
      "cloudflare",
      "github",
      "local",
    ]);
  });

  it("does not also emit the ordinary not-in-Bitwarden warning", () => {
    // `relevant()` has to exclude these from the normal comparisons, or the
    // correct state produces a warning and the error gets lost beside it.
    const findings = run({
      local: new Map([
        ["BWS_ACCESS_TOKEN", "0.abc"],
        ["CRON_SECRET", "x"],
      ]),
      bws: bws({ CRON_SECRET: "x" }),
      github: [gh("CRON_SECRET")],
      neverStore: never,
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

describe("minted credentials", () => {
  // `SANDBOX_PROXY_TOKEN` is signed at deploy time and written straight to the
  // Worker, so it is in no Bitwarden project by design. The failure this guards
  // is the §3.6 prune path being told the live proxy credential is an orphan.
  const minted = new Set(["SANDBOX_PROXY_TOKEN"]);
  const onWorker = new Map([
    ["production-sandbox", new Set(["SANDBOX_PROXY_TOKEN"])],
  ]);

  it("POSITIVE CONTROL: an unmarked Worker secret absent from Bitwarden IS an orphan", () => {
    // Run first and deliberately: it establishes that the input below reaches
    // the Cloudflare pass and produces a finding. Without it, the next test
    // would pass just as well if `cloudflare` were being ignored entirely, or
    // if `run()` had stopped calling audit at all.
    const findings = run({ cloudflare: onWorker });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.store).toBe("cloudflare");
    expect(findings[0]!.summary).toMatch(/not in Bitwarden/);
  });

  it("is NOT an orphan on the Worker — that is where it belongs", () => {
    // The same world as above, with the key marked. Deleting it is what the
    // prune path would do next, and recovery is not instant: the token comes
    // back on the following deploy, with an outage in between.
    expect(run({ cloudflare: onWorker, minted })).toEqual([]);
  });

  it("is an error when a copy is sitting in Bitwarden", () => {
    // A stored copy is a long-lived token nobody rotates, beside one that
    // rotates every deploy, and the stale copy is the one an operator reaches
    // for when something breaks.
    const findings = run({ bws: bws({ SANDBOX_PROXY_TOKEN: "eyJ" }), minted });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("error");
    expect(findings[0]!.summary).toMatch(/minted at deploy time/);
  });

  it("is an error when a copy is a GitHub secret", () => {
    // What CI needs is the signing key, not a token somebody minted once.
    const findings = run({ github: [gh("SANDBOX_PROXY_TOKEN")], minted });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.store).toBe("github");
    expect(findings[0]!.severity).toBe("error");
  });

  it("never says a minted key must be deleted from the Worker", () => {
    // The failure from marking it `never-store` instead, the intuitive reach
    // since it is indeed never stored. That classification inverts the orphan
    // warning into an error demanding its removal from the one place it has to
    // be, which is worse than the bug it was meant to fix.
    const findings = run({ cloudflare: onWorker, minted });
    expect(findings.map((f) => f.summary).join(" ")).not.toMatch(/delete/i);
  });

  it("does not report a minted key as ordinary Bitwarden drift", () => {
    // Only the minted error fires: the "in Bitwarden, missing from your .env"
    // and "not in the GitHub environment" passes must stay quiet, or the real
    // finding is buried under two that suggest pushing would help.
    const findings = run({
      bws: bws({ SANDBOX_PROXY_TOKEN: "eyJ" }),
      route: () => "production",
      minted,
    });
    expect(findings).toHaveLength(1);
  });
});

describe("GitHub variables", () => {
  // `PROJECT_REF` is public and per-environment, so it lives in the variable
  // store. The point of that store, for this file, is that `gh variable list`
  // returns the VALUE, so the §3.6 limitation ("names only… a changed value
  // is undetectable") does not apply to these keys.
  const variables = new Set(["PROJECT_REF"]);

  it("POSITIVE CONTROL: a matching variable produces no finding", () => {
    // Run first and deliberately. Every assertion below is "a finding exists";
    // this one establishes that the same inputs can also produce silence, so
    // the others are not passing because everything reports.
    expect(
      run({
        local: new Map([["PROJECT_REF", "abcdefgh"]]),
        bws: bws({ PROJECT_REF: "abcdefgh" }),
        githubVariables: [ghVar("PROJECT_REF", "abcdefgh")],
        variables,
      }),
    ).toEqual([]);
  });

  it("detects a VALUE that drifted — the thing secrets cannot do", () => {
    // Somebody edited the variable in the GitHub UI. Every name is present,
    // every timestamp is plausible, and the deploy is configured with a value
    // nobody stored. A presence check calls this healthy.
    const findings = run({
      local: new Map([["PROJECT_REF", "abcdefgh"]]),
      bws: bws({ PROJECT_REF: "abcdefgh" }),
      githubVariables: [ghVar("PROJECT_REF", "WRONGREF")],
      variables,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.store).toBe("github");
    expect(findings[0]!.severity).toBe("error");
    expect(findings[0]!.summary).toMatch(/VALUE disagrees with Bitwarden/);
  });

  it("tells a MISSING variable apart from a drifted one", () => {
    // Different fixes: one is "push it", the other is "decide which store is
    // right first". A single message covering both sends half the readers to
    // the wrong remedy.
    const missing = run({
      local: new Map([["PROJECT_REF", "abcdefgh"]]),
      bws: bws({ PROJECT_REF: "abcdefgh" }),
      githubVariables: [],
      variables,
    });
    expect(missing).toHaveLength(1);
    expect(missing[0]!.summary).toMatch(/NOT a variable/);
    expect(missing[0]!.summary).not.toMatch(/VALUE disagrees/);

    const drifted = run({
      local: new Map([["PROJECT_REF", "abcdefgh"]]),
      bws: bws({ PROJECT_REF: "abcdefgh" }),
      githubVariables: [ghVar("PROJECT_REF", "other")],
      variables,
    });
    expect(drifted[0]!.summary).toMatch(/VALUE disagrees/);
    expect(drifted[0]!.summary).not.toMatch(/NOT a variable/);
  });

  it("does not look for a variable in the SECRET store", () => {
    // The bug this shape prevents: a variable key compared against
    // `gh secret list`, which never holds it, reporting "the deploy cannot see
    // it" on every run of a correctly-configured environment.
    const findings = run({
      local: new Map([["PROJECT_REF", "abcdefgh"]]),
      bws: bws({ PROJECT_REF: "abcdefgh" }),
      github: [],
      githubVariables: [ghVar("PROJECT_REF", "abcdefgh")],
      variables,
    });
    expect(findings).toEqual([]);
  });

  it("does not apply staleness to a variable whose value already matches", () => {
    // A timestamp is a proxy for a comparison that could not be made. Where
    // the real comparison IS available, the proxy only manufactures noise: a
    // re-push with an identical value would read as "the deploy is still using
    // the previous value" while the two values are byte-identical.
    expect(
      run({
        local: new Map([["PROJECT_REF", "abcdefgh"]]),
        bws: bws({ PROJECT_REF: ["abcdefgh", "2026-08-13T12:00:00Z"] }),
        githubVariables: [
          ghVar("PROJECT_REF", "abcdefgh", "staging", "2026-08-01T12:00:00Z"),
        ],
        variables,
      }),
    ).toEqual([]);
  });

  it("flags a copy in an environment it does not belong to", () => {
    const findings = run({
      bws: bws({ PROJECT_REF: "abcdefgh" }),
      githubVariables: [
        ghVar("PROJECT_REF", "abcdefgh", "staging"),
        ghVar("PROJECT_REF", "abcdefgh", "production"),
      ],
      local: new Map([["PROJECT_REF", "abcdefgh"]]),
      variables,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.summary).toMatch(/not where it belongs/);
    expect(findings[0]!.summary).toContain("production");
  });

  it("flags an orphan variable left by a rename", () => {
    const findings = run({
      githubVariables: [ghVar("OLD_URL", "https://x")],
      variables,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("warning");
    expect(findings[0]!.summary).toMatch(/orphan/);
    // Named as a variable, because deleting it means `gh variable delete` and
    // looking for it under Secrets finds nothing.
    expect(findings[0]!.summary).toMatch(/variable/);
  });

  it("still compares its value against the local .env", () => {
    // Variables are in Bitwarden too, so the local axis is unchanged. That is
    // the whole reason `pull` can rebuild a working file.
    const findings = run({
      local: new Map([["PROJECT_REF", "stale"]]),
      bws: bws({ PROJECT_REF: "abcdefgh" }),
      githubVariables: [ghVar("PROJECT_REF", "abcdefgh")],
      variables,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.store).toBe("local");
    expect(findings[0]!.summary).toMatch(/disagrees with Bitwarden/);
  });
});

describe("a key in the wrong GitHub store", () => {
  const variables = new Set(["PROJECT_REF"]);
  const declared = new Set(["PROJECT_REF", "DISCORD_TOKEN"]);

  it("errors on a public key stored as a SECRET", () => {
    // GitHub masks a secret's value in logs by substring. PROJECT_REF as a
    // secret redacts `https://supabase.com/dashboard/project/***`, the
    // paused-project gate's entire output, and every Supabase hostname the
    // ref appears inside.
    const findings = run({
      github: [gh("PROJECT_REF")],
      variables,
      declared,
    });
    expect(findings.some((f) => f.severity === "error")).toBe(true);
    expect(findings.map((f) => f.summary).join(" ")).toMatch(
      /is public and is a SECRET/,
    );
  });

  it("errors on a secret stored as a VARIABLE, and says to rotate it", () => {
    // The irreversible direction. A variable's value is readable through the
    // API, so this is not "in the wrong place", it is disclosed.
    const findings = run({
      bws: bws({ DISCORD_TOKEN: "tok" }),
      local: new Map([["DISCORD_TOKEN", "tok"]]),
      github: [gh("DISCORD_TOKEN")],
      githubVariables: [ghVar("DISCORD_TOKEN", "tok")],
      variables,
      declared,
    });
    const leak = findings.find((f) =>
      /is a secret and is a VARIABLE/.test(f.summary),
    );
    expect(leak).toBeDefined();
    expect(leak!.severity).toBe("error");
    expect(leak!.summary).toMatch(/rotate/);
  });

  it("does not call an unrecognised variable a leaked secret", () => {
    // An unknown name in the variable store is an orphan from a rename. Naming
    // it a disclosed credential would be a guess, and a loud wrong one of the
    // kind that trains people to skim the category.
    const findings = run({
      githubVariables: [ghVar("SOME_OLD_NAME", "x")],
      variables,
      declared,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("warning");
    expect(findings[0]!.summary).toMatch(/orphan/);
  });

  it("stays quiet about stores when the registry sets are absent", () => {
    // Callers without a loaded registry get the pre-variables behaviour rather
    // than every secret suddenly reading as misplaced.
    expect(
      run({
        local: new Map([["DISCORD_TOKEN", "tok"]]),
        bws: bws({ DISCORD_TOKEN: "tok" }),
        github: [gh("DISCORD_TOKEN")],
      }),
    ).toEqual([]);
  });
});

describe("repository-level variables", () => {
  /**
   * The scope `push` never writes to, and the one every other check here is
   * blind to.
   *
   * An ENVIRONMENT variable shadows a repository variable of the same name, so
   * a repository-level `AIRTABLE_BASE_ID`, set by hand back when the setup
   * docs said to, is read by no job, drifts from Bitwarden forever, and turns
   * live the moment somebody removes the environment copy. Every assertion
   * below is a way that could go unnoticed.
   */
  const variables = new Set(["AIRTABLE_BASE_ID", "PROJECT_REF"]);
  const declared = new Set([
    "AIRTABLE_BASE_ID",
    "PROJECT_REF",
    "DISCORD_TOKEN",
    "BWS_ACCESS_TOKEN",
  ]);

  /** A scan that succeeded and saw these names. */
  const saw = (...names: string[]): RepositoryVariableScan => ({
    readable: true,
    names,
  });

  it("POSITIVE CONTROL: a scan that found nothing produces no findings", () => {
    // Run first and deliberately. Everything below asserts "a finding exists",
    // and this establishes that the same inputs can also produce silence, so
    // the rest are not passing because these inputs report unconditionally.
    //
    // That the CHECK RAN is reported by `runEnvAudit`'s coverage line, not by
    // the finding list; `commands.audit.test.ts` asserts that half.
    expect(run({ repositoryVariables: saw(), variables, declared })).toEqual(
      [],
    );
  });

  it("reports a repository variable colliding with a managed key", () => {
    const findings = run({
      repositoryVariables: saw("AIRTABLE_BASE_ID"),
      variables,
      declared,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.key).toBe("AIRTABLE_BASE_ID");
    expect(findings[0]!.store).toBe("github");
    // A warning, not an error: the environment copy wins today, so nothing is
    // broken. It is the orphan category, state nothing manages and nothing
    // else would ever mention, which is a warning everywhere else in here.
    expect(findings[0]!.severity).toBe("warning");
  });

  it("says WHY it is dangerous, not merely that it exists", () => {
    // The whole finding. "There is also a repository variable" reads as
    // tidiness and gets deferred; the reason it cannot be deferred is that it
    // is invisible now and authoritative later.
    const [finding] = run({
      repositoryVariables: saw("AIRTABLE_BASE_ID"),
      variables,
      declared,
    });
    expect(finding!.summary).toMatch(/shadows it/);
    expect(finding!.summary).toMatch(/invisible/);
    expect(finding!.summary).toMatch(/live value/);
  });

  it("names the fix, with the key in it", () => {
    // `gh variable delete AIRTABLE_BASE_ID`, with no `--env`, which is the
    // flag that would delete the managed copy and leave the stale one in charge.
    const [finding] = run({
      repositoryVariables: saw("AIRTABLE_BASE_ID"),
      variables,
      declared,
    });
    expect(finding!.summary).toContain("gh variable delete AIRTABLE_BASE_ID");
    expect(finding!.summary).not.toContain("--env");
  });

  it("says nothing about a name the registry does not declare", () => {
    // Another team's variable is another team's business, and a check that
    // reports every one of them is a check people learn to skim, which costs
    // the finding above its reader.
    //
    // The declared name alongside it is the control: without it this would
    // pass just as well if the whole pass were skipped.
    const findings = run({
      repositoryVariables: saw("SOMEONE_ELSES_FLAG", "AIRTABLE_BASE_ID"),
      variables,
      declared,
    });
    expect(findings.map((f) => f.key)).toEqual(["AIRTABLE_BASE_ID"]);
  });

  it("reports a FAILED list as 'could not check'", () => {
    // ⚠️ The assertion that protects every other one in this describe. A scan
    // that could not run must never look like a scan that ran clean: listing
    // repository variables can fail on a permission that leaves the
    // environment reads working, and the silent downgrade to "nothing there"
    // is the exact failure this check was added to catch, one scope up.
    const findings = run({
      repositoryVariables: { readable: false, reason: "HTTP 403: Forbidden" },
      variables,
      declared,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.key).toBe("(repository variables)");
    expect(findings[0]!.summary).toMatch(/could not check/);
    // The reason travels with it: a 403 is an admin's problem and an
    // unauthenticated CLI is the reader's, and the finding cannot say which
    // without carrying it.
    expect(findings[0]!.summary).toContain("HTTP 403: Forbidden");
  });

  it("keeps 'could not check' distinguishable from 'checked, clean'", () => {
    // Asserted as a comparison rather than as two separate tests, because the
    // bug is that the two outputs become the SAME output, which two passing
    // tests in different worlds would not notice.
    const failed = run({
      repositoryVariables: { readable: false, reason: "HTTP 403: Forbidden" },
      variables,
      declared,
    });
    const clean = run({ repositoryVariables: saw(), variables, declared });

    expect(clean).toEqual([]);
    expect(failed).not.toEqual(clean);
    expect(failed[0]!.summary).toMatch(/rules out NOTHING/);
  });

  it("does not fail the audit over a check it could not run", () => {
    // A warning, so `runEnvAudit` still exits 0. An unreadable list is a gap
    // in coverage, not a defect found, and making it exit 1 on every run of a
    // machine without the permission is how the whole report gets ignored.
    expect(
      hasErrors(
        run({
          repositoryVariables: { readable: false, reason: "HTTP 403" },
          variables,
          declared,
        }),
      ),
    ).toBe(false);
  });

  it("stays silent when the caller never looked", () => {
    // Absent is a third state, and it must not claim anything. Callers that
    // do not pass a scan get the pre-existing behaviour rather than a finding
    // about a check nobody asked for.
    expect(
      run({
        repositoryVariables: undefined,
        variables,
        declared,
        local: new Map([["AIRTABLE_BASE_ID", "app1"]]),
        bws: bws({ AIRTABLE_BASE_ID: "app1" }),
        githubVariables: [ghVar("AIRTABLE_BASE_ID", "app1")],
      }),
    ).toEqual([]);
  });

  it("errors on a declared SECRET at repository scope, and says to rotate", () => {
    // Not a shadowing problem at all. Secrets and variables are separate
    // namespaces, so nothing hides this one. It is a disclosure: the value is
    // readable by everyone who can see the repository's Actions config.
    const findings = run({
      repositoryVariables: saw("DISCORD_TOKEN"),
      variables,
      declared,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("error");
    expect(findings[0]!.summary).toMatch(/REPOSITORY-level GitHub variable/);
    expect(findings[0]!.summary).toMatch(/rotate/);
    // And it must not claim the shadowing story, which would send the reader
    // looking for an environment copy that is not there.
    expect(findings[0]!.summary).not.toMatch(/shadows it/);
  });

  it("still reports a never-store credential at that scope", () => {
    // `ignore` is filtered out below; `neverStore` and `minted` are NOT. A
    // credential that must never be stored anywhere, sitting in the one store
    // that hands its value back to any reader, is the worst case this file
    // knows about rather than an exempt one.
    const findings = run({
      repositoryVariables: saw("BWS_ACCESS_TOKEN"),
      variables,
      declared,
      neverStore: new Set(["BWS_ACCESS_TOKEN"]),
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("error");
  });

  it("skips a variable this target does not route", () => {
    // `ignoredFor("preflight")` sweeps in every key that tier was not narrowed
    // to, and push writes no copy of those here, so there is no managed
    // environment copy of ours doing the shadowing, and nothing to report.
    // Every other pass in this file treats an ignored key the same way.
    expect(
      run({
        repositoryVariables: saw("PROJECT_REF"),
        variables,
        declared,
        ignore: new Set(["PROJECT_REF"]),
      }),
    ).toEqual([]);
  });

  it("does not report a key that legitimately lives outside these stores", () => {
    // `GITHUB_ORG` is a committed constant, ignored by every other pass here.
    // A repository variable holding it is somebody making a reasonable choice,
    // and calling that a leaked secret is the loud wrong guess that costs the
    // real findings their audience.
    expect(
      run({
        repositoryVariables: saw("GITHUB_ORG"),
        variables,
        declared: new Set([...declared, "GITHUB_ORG"]),
        ignore: new Set(["GITHUB_ORG"]),
      }),
    ).toEqual([]);
  });

  it("does not confuse the repository scope with an environment one", () => {
    // The managed environment copy is correct and must stay silent while the
    // repository one is reported. If these two ever merge into one list, this
    // is the test that notices.
    const findings = run({
      local: new Map([["AIRTABLE_BASE_ID", "app1"]]),
      bws: bws({ AIRTABLE_BASE_ID: "app1" }),
      githubVariables: [ghVar("AIRTABLE_BASE_ID", "app1")],
      repositoryVariables: saw("AIRTABLE_BASE_ID"),
      variables,
      declared,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.summary).toMatch(/REPOSITORY-level/);
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
