/**
 * The three-valued logic the adaptive menu rests on.
 *
 * The interesting cases are all `"unknown"`. A probe that cannot read the
 * machine must leave the menu exactly as it was, and every assertion below
 * that mentions `"unknown"` is guarding that: the failure mode this design
 * has to avoid is a tool that hides the command you were looking for because
 * a subprocess timed out.
 */
import { describe, expect, it } from "vitest";
import type { Condition } from "./commands.js";
import {
  blockedBecause,
  describeEnvironment,
  holds,
  isOffered,
  probeEnvironment,
  UNKNOWN_ENVIRONMENT,
  type Environment,
  type Known,
} from "./environment.js";

const CONDITIONS: Condition[] = ["docker", "stack-running", "stack-stopped"];

/** An environment with one fact set and the rest unreadable. */
function withStack(stack: Known): Environment {
  return { ...UNKNOWN_ENVIRONMENT, stack };
}

describe("holds", () => {
  it("reads the fact each condition names", () => {
    expect(holds("docker", { ...UNKNOWN_ENVIRONMENT, docker: "yes" })).toBe(
      "yes",
    );
    expect(holds("stack-running", withStack("yes"))).toBe("yes");
    expect(holds("stack-running", withStack("no"))).toBe("no");
  });

  it("negates a stack it can read", () => {
    expect(holds("stack-stopped", withStack("no"))).toBe("yes");
    expect(holds("stack-stopped", withStack("yes"))).toBe("no");
  });

  /**
   * The negation of an unreadable fact is still unreadable — not its opposite.
   * Collapsing this to `"yes"` would offer `stop` on a machine where nothing
   * is known to be running, which is the inverse of the point.
   */
  it("keeps unknown unknown through the negation", () => {
    for (const condition of CONDITIONS) {
      expect(holds(condition, UNKNOWN_ENVIRONMENT), condition).toBe("unknown");
    }
  });
});

describe("isOffered", () => {
  it("offers a command that asks for nothing", () => {
    expect(isOffered({}, withStack("no"))).toBe(true);
  });

  it("withholds one whose condition is definitively unmet", () => {
    expect(isOffered({ when: "stack-running" }, withStack("no"))).toBe(false);
  });

  it("offers one whose condition holds", () => {
    expect(isOffered({ when: "stack-running" }, withStack("yes"))).toBe(true);
  });

  it("offers everything on a machine it cannot read", () => {
    for (const condition of CONDITIONS) {
      expect(
        isOffered({ when: condition }, UNKNOWN_ENVIRONMENT),
        condition,
      ).toBe(true);
    }
  });
});

describe("blockedBecause", () => {
  it("finds nothing wrong with a command that asks for nothing", () => {
    expect(blockedBecause({}, withStack("no"))).toBeNull();
  });

  it("explains an unmet need in a phrase that finishes a hint", () => {
    expect(blockedBecause({ needs: "stack-running" }, withStack("no"))).toBe(
      "the local stack is not running",
    );
  });

  it("stays quiet when the need is met, or unreadable", () => {
    expect(
      blockedBecause({ needs: "stack-running" }, withStack("yes")),
    ).toBeNull();
    expect(
      blockedBecause({ needs: "stack-running" }, UNKNOWN_ENVIRONMENT),
    ).toBeNull();
  });

  it("has a phrase for every condition", () => {
    for (const condition of CONDITIONS) {
      const unmet: Environment = { docker: "no", stack: "yes", envFile: "no" };
      // `stack-stopped` is the one that is unmet when the stack is UP, so this
      // environment leaves exactly one condition met and the rest blocked --
      // enough to prove no condition renders as `undefined`.
      const reason = blockedBecause({ needs: condition }, unmet);
      if (reason !== null) expect(reason, condition).not.toContain("undefined");
    }
  });
});

describe("describeEnvironment", () => {
  it("reports all three facts on their own lines", () => {
    expect(describeEnvironment(UNKNOWN_ENVIRONMENT).split("\n")).toHaveLength(
      3,
    );
  });

  it("says so plainly when a fact could not be read", () => {
    expect(describeEnvironment(UNKNOWN_ENVIRONMENT)).toContain(
      "could not tell",
    );
  });
});

describe("probeEnvironment", () => {
  /**
   * Total, whatever this machine is.
   *
   * Asserted on shape rather than values because the values are the machine
   * the suite happens to run on — CI has no Docker, a contributor's laptop
   * may. What must hold everywhere is that it answers rather than throwing:
   * every caller treats it as a fact it can read, and a throw here would take
   * down the menu before it printed anything.
   */
  it("answers with a well-formed environment and never throws", () => {
    const env = probeEnvironment();
    const valid: Known[] = ["yes", "no", "unknown"];

    expect(valid).toContain(env.docker);
    expect(valid).toContain(env.stack);
    expect(valid).toContain(env.envFile);
  });

  it("rules out a stack when there is no daemon to hold it", () => {
    const env = probeEnvironment();
    if (env.docker === "no") expect(env.stack).toBe("no");
  });
});
