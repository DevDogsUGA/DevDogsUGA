import { describe, expect, it } from "vitest";
import {
  CHECK_IDENTITY,
  CHECK_MIGRATIONS,
  CHECK_OVERREACH,
} from "../planner/checks.js";
import type { PlannerDb } from "../planner/db.js";
import { DeployError } from "./report.js";
import { runRequirePlanner } from "./require-planner.js";

/**
 * The guard's own concerns — the checks themselves are covered in
 * `planner/checks.test.ts`. What is left here: the missing-variable refusal,
 * the verdict-to-DeployError translation (so `cli.ts` renders it like every
 * other deploy failure), and that the connection is closed on BOTH paths.
 */
function fake(answers: Record<string, Record<string, unknown>[] | Error>): {
  connect: (url: string) => PlannerDb;
  urls: string[];
  ended: () => boolean;
} {
  const urls: string[] = [];
  let ended = false;
  return {
    urls,
    ended: () => ended,
    connect: (url: string) => {
      urls.push(url);
      return {
        async run(query: string) {
          const answer = answers[query];
          if (answer === undefined) {
            throw new Error(`unexpected query: ${query}`);
          }
          if (answer instanceof Error) throw answer;
          return answer;
        },
        async end() {
          ended = true;
        },
      };
    },
  };
}

const HEALTHY = {
  [CHECK_IDENTITY]: [{ who: "migration_planner" }],
  [CHECK_OVERREACH]: new Error("permission denied for schema platform"),
  [CHECK_MIGRATIONS]: [{ n: 3 }],
};

describe("deploy require-planner", () => {
  it("refuses when DB_URL is absent, naming the variable", async () => {
    // The wrong diagnosis would be a connection error. An empty env var is
    // the push-never-ran case, and the message has to say so.
    const { connect } = fake({});
    await expect(runRequirePlanner({}, connect)).rejects.toThrow(DeployError);
    await expect(runRequirePlanner({}, connect)).rejects.toThrow(/DB_URL/);
  });

  it("passes the healthy credential and connects to exactly the given URL", async () => {
    const harness = fake(HEALTHY);
    await runRequirePlanner({ DB_URL: "postgresql://x" }, harness.connect);
    expect(harness.urls).toEqual(["postgresql://x"]);
    expect(harness.ended()).toBe(true);
  });

  it("turns a bad verdict into a DeployError that names the fix", async () => {
    const harness = fake({ [CHECK_IDENTITY]: [{ who: "postgres" }] });
    const run = runRequirePlanner(
      { DB_URL: "postgresql://x" },
      harness.connect,
    );
    await expect(run).rejects.toThrow(DeployError);
    // The detail is the operator's next command; a refusal with no next step
    // is a red job somebody has to reverse-engineer.
    await expect(
      runRequirePlanner({ DB_URL: "postgresql://x" }, harness.connect),
    ).rejects.toMatchObject({
      detail: expect.arrayContaining([
        expect.stringContaining("planner create"),
      ]) as unknown,
    });
  });

  it("closes the connection even when refusing", async () => {
    const harness = fake({ [CHECK_IDENTITY]: [{ who: "postgres" }] });
    await runRequirePlanner(
      { DB_URL: "postgresql://x" },
      harness.connect,
    ).catch(() => undefined);
    expect(harness.ended()).toBe(true);
  });
});
