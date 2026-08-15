import { beforeAll, describe, expect, it } from "vitest";
import { applyOnlyKeys } from "@devdogsuga/env";
import { loadRegistry } from "../env/discovery.js";
import { accepts, githubTargets, routeTo } from "./environments.js";

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
  it("refuses apply-only keys in the unreviewed environments", () => {
    expect(accepts("production", APPLY_KEY)).toBe(false);
    expect(accepts("staging", APPLY_KEY)).toBe(false);
  });

  it("takes only the apply-only keys in production-apply", () => {
    // It exists to hold exactly those. A third key landing there would make
    // "behind reviewers" mean less than it says.
    expect(accepts("production-apply", APPLY_KEY)).toBe(true);
    expect(accepts("production-apply", "DISCORD_TOKEN")).toBe(false);
  });

  it("accepts anything in preflight, which holds no live credentials", () => {
    expect(accepts("preflight", APPLY_KEY)).toBe(true);
    expect(accepts("preflight", "CRON_SECRET")).toBe(true);
  });
});
