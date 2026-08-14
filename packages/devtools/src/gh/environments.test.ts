import { describe, expect, it } from "vitest";
import { APPLY_ONLY_KEYS } from "../bws/environments.js";
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

const APPLY_KEY = APPLY_ONLY_KEYS[0];

describe("githubTargets", () => {
  it("fans one production project out to two environments", () => {
    expect(githubTargets("devdogs-production")).toEqual([
      "production",
      "production-apply",
    ]);
  });

  it("gives the other projects exactly one target each", () => {
    expect(githubTargets("devdogs-staging")).toEqual(["staging"]);
    expect(githubTargets("devdogs-dry-run")).toEqual(["dry-run"]);
  });

  it("returns nothing for a project it does not know", () => {
    expect(githubTargets("devdogs-nonsense")).toEqual([]);
  });
});

describe("routeTo", () => {
  it("sends an apply-only credential to production-apply, never production", () => {
    // The whole point. If this ever returns "production", the gate is gone.
    expect(routeTo("devdogs-production", APPLY_KEY)).toBe("production-apply");
  });

  it("sends every ordinary secret to production", () => {
    expect(routeTo("devdogs-production", "DISCORD_TOKEN")).toBe("production");
  });

  it("routes every apply-only key, not just the first", () => {
    // A list, not a convention. Adding a third key to APPLY_ONLY_KEYS must not
    // silently leave it routed to the unreviewed environment.
    for (const key of APPLY_ONLY_KEYS) {
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
    expect(routeTo("devdogs-dry-run", "CRON_SECRET")).toBe("dry-run");
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

  it("accepts anything in dry-run, which holds no live credentials", () => {
    expect(accepts("dry-run", APPLY_KEY)).toBe(true);
    expect(accepts("dry-run", "CRON_SECRET")).toBe(true);
  });
});
