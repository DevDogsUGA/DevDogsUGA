import { beforeAll, describe, expect, it } from "vitest";
import { applyOnlyKeys } from "@devdogsuga/env";
import { loadRegistry } from "../env/discovery.js";
import {
  accepts,
  acceptedBy,
  acceptsKey,
  githubTargets,
  routeTo,
} from "./environments.js";

/**
 * The routing that IS the reviewer gate.
 *
 * `production` deploys on a push with nothing in front of it; `production-apply`
 * has required reviewers. A write-capable credential reaching the first makes
 * the second decorative — so the failure to guard against is not "the push
 * errored", it is "the push succeeded and put the token somewhere that deploys
 * unreviewed".
 */

// The apply set is derived from the manifests now; routing refuses to answer
// on an empty registry rather than failing open.
beforeAll(async () => {
  await loadRegistry();
});

// Literals, because vitest collects the `it` blocks before `beforeAll` fills
// the registry. The completeness test pins `applyOnlyKeys()` to exactly this
// pair, and the first routeTo test re-asserts the tie here.
const APPLY_KEYS = ["AIRTABLE_APPLY_PAT", "SUPABASE_ACCESS_TOKEN"] as const;
const APPLY_KEY = APPLY_KEYS[0];

describe("githubTargets", () => {
  it("fans one production project out to two environments", () => {
    expect(githubTargets("devdogs-production")).toEqual([
      "production",
      "production-apply",
    ]);
  });

  it("gives the other projects exactly one target each", () => {
    expect(githubTargets("devdogs-staging")).toEqual(["staging"]);
    expect(githubTargets("devdogs-preflight")).toEqual(["preflight"]);
  });

  it("returns nothing for a project it does not know", () => {
    expect(githubTargets("devdogs-nonsense")).toEqual([]);
  });
});

describe("routeTo", () => {
  it("tests the same set the registry derives", () => {
    expect(applyOnlyKeys()).toEqual([...APPLY_KEYS]);
  });

  it("sends an apply-only credential to production-apply, never production", () => {
    // The whole point. If this ever returns "production", the gate is gone.
    expect(routeTo("devdogs-production", APPLY_KEY)).toBe("production-apply");
  });

  it("sends every ordinary secret to production", () => {
    // The PRIMARY environment. `production-apply` also accepts it — see
    // `acceptedBy` below — and `production` comes first because that is where
    // the deploy reads it.
    expect(routeTo("devdogs-production", "DISCORD_TOKEN")).toBe("production");
  });

  it("routes every apply-only key, not just the first", () => {
    // A set, not a convention. A third `tier: "apply"` declaration must not
    // silently leave its key routed to the unreviewed environment — so this
    // loops over the DERIVED set, catching a new member the literals above
    // have not heard of yet.
    for (const key of applyOnlyKeys()) {
      expect(routeTo("devdogs-production", key)).toBe("production-apply");
    }
  });

  it("gives an apply-only key no home outside production", () => {
    // Not an error: it belongs to production, and staging simply has no place
    // for it. The caller skips rather than refusing.
    expect(routeTo("devdogs-staging", APPLY_KEY)).toBeNull();
  });

  it("routes ordinary secrets in the single-target projects", () => {
    expect(routeTo("devdogs-staging", "CRON_SECRET")).toBe("staging");
    expect(routeTo("devdogs-preflight", "CRON_SECRET")).toBe("preflight");
  });
});

describe("accepts", () => {
  it("⚠️ refuses EVERY apply-only key in the unreviewed environments", () => {
    // THE INVARIANT, and since `production-apply` became a superset it is the
    // only thing enforcing the reviewer gate: `production.excludeKeys`. By
    // name and per key, not `applyOnlyKeys().every(...)` — a derived set that
    // emptied would make the loop vacuous and the test green.
    for (const key of APPLY_KEYS) {
      expect(accepts("production", key), `${key} in production`).toBe(false);
      expect(accepts("staging", key), `${key} in staging`).toBe(false);
    }
    // POSITIVE CONTROL: the mechanism refuses these two and nothing else, so
    // the assertions above are not an `accepts()` that returns false for
    // everything.
    expect(accepts("production", "DISCORD_TOKEN")).toBe(true);
    expect(accepts("staging", "DISCORD_TOKEN")).toBe(true);
  });

  it("refuses the plan-tier key in staging, where no job reads it", () => {
    // Not a security gate like the apply exclusion — a stray copy could not
    // write anything — but the same failure mode as §3.6's orphans: a
    // credential nothing manages and nothing would ever mention. `staging`
    // excludes it so a push routes it nowhere and `audit` names a stray.
    expect(accepts("staging", "AIRTABLE_PLAN_PAT")).toBe(false);
    // The two environments whose plan jobs read it still take it.
    expect(accepts("production", "AIRTABLE_PLAN_PAT")).toBe(true);
    expect(accepts("preflight", "AIRTABLE_PLAN_PAT")).toBe(true);
  });

  it("gives production-apply a SUPERSET of production", () => {
    // It used to take the apply pair and nothing else, which withheld
    // plan-tier secrets and every public variable from the three jobs that run
    // there. Restricting the REVIEWED half buys nothing — same Bitwarden
    // project, required reviewers in front of it — and the gate is the row
    // above, about the unreviewed half.
    expect(accepts("production-apply", APPLY_KEY)).toBe(true);
    expect(accepts("production-apply", "DISCORD_TOKEN")).toBe(true);
    expect(accepts("production-apply", "CLOUDFLARE_API_TOKEN")).toBe(true);
    expect(accepts("production-apply", "AIRTABLE_BASE_ID")).toBe(true);
  });

  it("accepts anything in preflight, which holds no live credentials", () => {
    expect(accepts("preflight", APPLY_KEY)).toBe(true);
    expect(accepts("preflight", "CRON_SECRET")).toBe(true);
  });
});

describe("acceptedBy", () => {
  it("fans an ordinary production key out to both environments", () => {
    expect(acceptedBy("devdogs-production", "DISCORD_TOKEN")).toEqual([
      "production",
      "production-apply",
    ]);
  });

  it("gives an apply-only key the reviewed environment and only that", () => {
    // The set-shaped statement of the invariant, and what `env audit` compares
    // a found copy against. If `production` ever appears in this list, a
    // write-capable credential is sitting where an unreviewed deploy reads it.
    for (const key of APPLY_KEYS) {
      expect(acceptedBy("devdogs-production", key), key).toEqual([
        "production-apply",
      ]);
    }
  });

  it("stays a single-element answer for the one-environment projects", () => {
    expect(acceptedBy("devdogs-staging", "CRON_SECRET")).toEqual(["staging"]);
    expect(acceptedBy("devdogs-staging", APPLY_KEY)).toEqual([]);
  });
});

describe("acceptsKey", () => {
  // The predicate `env audit` passes as `AuditInput.accepted`. It lives in this
  // module rather than at that call site because `runEnvAudit` cannot be
  // unit-tested without mocking three remote services, so logic written there
  // has no tests at all.
  it("agrees with accepts() on a known environment", () => {
    expect(acceptsKey("DISCORD_TOKEN", "production-apply")).toBe(true);
    // ⚠️ The gate, through the audit's door this time: a copy of an apply-tier
    // key found in `production` must read as misplaced.
    for (const key of APPLY_KEYS) {
      expect(acceptsKey(key, "production"), key).toBe(false);
      expect(acceptsKey(key, "production-apply"), key).toBe(true);
    }
  });

  it("refuses an environment it does not recognise", () => {
    // Fails CLOSED. The name comes from whatever `gh` listed, and this decides
    // whether a found copy is reported as a stray — so an unknown environment
    // holding a credential is the case most worth reporting, not least worth.
    expect(acceptsKey("DISCORD_TOKEN", "production-legacy")).toBe(false);
    expect(acceptsKey("DISCORD_TOKEN", "")).toBe(false);
  });
});
