import { describe, expect, it } from "vitest";
import {
  DEPLOY_ENVIRONMENTS,
  ENV_TARGETS,
  TARGETS,
  VAULT_TARGETS,
  holdsOnlyNarrowedKeys,
} from "./targets.js";

/**
 * The facts every command reads off the one target table.
 *
 * `resolveEnvironment()` has its own coverage in `load.test.ts`; what is
 * asserted here is the DERIVED half of the table — the subsets and predicates
 * that exist so no command keeps a second copy of "which targets are like
 * this". A second copy is what the whole table replaced, and the failure it
 * caused was silent: two enums that agreed on the words `staging` and
 * `production` let `push --env staging` read the development `.env`.
 */

describe("holdsOnlyNarrowedKeys", () => {
  it("is exactly the targets that are not deploy environments", () => {
    // ⚠️ THE POINT OF THE FUNCTION, quantified over the whole table rather than
    // asserted about `preflight` by name. The rule is "a target no app boots
    // from exists only to feed CI's plan jobs, and a plan job is narrow by
    // construction" — so a future non-booting row inherits the narrowing
    // without anyone remembering to add it to a list. A hardcoded
    // `target === "preflight"` would pass a test that only ever named
    // preflight, and would then hand a new CI-only target every production
    // secret on the day it was added.
    const narrow = ENV_TARGETS.filter(holdsOnlyNarrowedKeys);
    const notDeployed = ENV_TARGETS.filter(
      (target) => !TARGETS[target].deployEnv,
    );
    expect(narrow).toEqual(notDeployed);

    // Non-vacuous in both directions: neither side may be the whole table or
    // empty, or the agreement above is trivially true. This repo has been
    // bitten by an assertion that quantified over an empty set.
    expect(narrow.length).toBeGreaterThan(0);
    expect(narrow.length).toBeLessThan(ENV_TARGETS.length);
  });

  it("answers for `development` too, which is not a vault target", () => {
    // The case a plausible hardcode gets wrong. `development` has no Bitwarden
    // project, so "everything except staging and production" is a tempting way
    // to spell the narrow set — and it would sweep in the one target whose file
    // is meant to carry every declared key.
    expect(holdsOnlyNarrowedKeys("development")).toBe(false);
  });

  it("says no to every deploy environment", () => {
    // The other side, stated positively: a target an app boots from needs the
    // full credential set, so narrowing one would break the deploy rather than
    // leak anything. Quantified, so a new deploy environment is covered.
    expect(DEPLOY_ENVIRONMENTS.length).toBeGreaterThan(0);
    for (const target of DEPLOY_ENVIRONMENTS) {
      expect(holdsOnlyNarrowedKeys(target), target).toBe(false);
    }
  });

  it("holds for the one row that has it today", () => {
    // Named as well as derived: `preflight` is the row the rule was written
    // for, and it is a vault target — the narrowing has to survive being one,
    // because a target with no project could never have pushed anything
    // anywhere and would not have been the finding.
    expect(TARGETS.preflight.deployEnv).toBe(false);
    expect(holdsOnlyNarrowedKeys("preflight")).toBe(true);
    expect(VAULT_TARGETS).toContain("preflight");
  });
});
