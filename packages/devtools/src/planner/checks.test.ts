import { describe, expect, it } from "vitest";
import {
  CHECK_IDENTITY,
  CHECK_MIGRATIONS,
  CHECK_OVERREACH,
  checkPlanner,
} from "./checks.js";
import type { PlannerDb } from "./db.js";

/**
 * The verdict logic, with a database faked at the `PlannerDb.run` seam.
 *
 * Every query in this feature is a constant string, so the fake is a map from
 * query to rows-or-throw — no client library to mock, and a test that hands in
 * an unexpected query fails by name instead of by silent `undefined`.
 */
function db(
  answers: Record<string, Record<string, unknown>[] | Error>,
): PlannerDb & { ended: boolean } {
  const fake = {
    ended: false,
    async run(query: string) {
      const answer = answers[query];
      if (answer === undefined) {
        throw new Error(`unexpected query: ${query}`);
      }
      if (answer instanceof Error) throw answer;
      return answer;
    },
    async end() {
      fake.ended = true;
    },
  };
  return fake;
}

const DENIED = new Error("permission denied for schema platform");

describe("checkPlanner", () => {
  it("passes the credential that authenticates as the planner, is denied platform, and reads migrations", async () => {
    const verdict = await checkPlanner(
      db({
        [CHECK_IDENTITY]: [{ who: "migration_planner" }],
        [CHECK_OVERREACH]: DENIED,
        [CHECK_MIGRATIONS]: [{ n: 50 }],
      }),
    );
    expect(verdict.ok).toBe(true);
    // The three green lines ARE the evidence — a caller prints them into the
    // job log, so their content is part of the contract.
    expect(verdict.lines.join("\n")).toMatch(
      /authenticated as migration_planner/,
    );
    expect(verdict.lines.join("\n")).toMatch(/cannot read platform/);
    expect(verdict.lines.join("\n")).toMatch(/50 rows/);
  });

  it("⚠️ refuses a full-privilege connection string by its identity", async () => {
    // The finding this whole feature exists for: postgres pasted where the
    // planner belongs. Identity is checked FIRST, so the refusal names the
    // role before any probe touches member data.
    const verdict = await checkPlanner(
      db({ [CHECK_IDENTITY]: [{ who: "postgres" }] }),
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.problem).toMatch(/"postgres", not migration_planner/);
    expect(verdict.problem).toMatch(/full-privilege/);
  });

  it("refuses a planner-named role that can read platform.*", async () => {
    // Same name, wrong grants — the shape `planner create` refuses to repair
    // in place. Reading the probe SUCCEEDING is the failure.
    const verdict = await checkPlanner(
      db({
        [CHECK_IDENTITY]: [{ who: "migration_planner" }],
        [CHECK_OVERREACH]: [{ id: "a-row-it-should-never-see" }],
      }),
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.problem).toMatch(/can read platform\.profile/);
  });

  it("refuses a planner that cannot do its one job", async () => {
    // POSITIVE CONTROL for the deny-probe: a role denied everywhere would
    // pass check 2, and this is what stops "denied everywhere" from reading
    // as healthy. The dry run right after this needs the migrations table.
    const verdict = await checkPlanner(
      db({
        [CHECK_IDENTITY]: [{ who: "migration_planner" }],
        [CHECK_OVERREACH]: DENIED,
        [CHECK_MIGRATIONS]: new Error(
          "permission denied for schema supabase_migrations",
        ),
      }),
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.problem).toMatch(/cannot read supabase_migrations/);
    expect(verdict.problem).toMatch(/grants/);
  });

  it("never closes the connection it was handed", async () => {
    const handle = db({
      [CHECK_IDENTITY]: [{ who: "migration_planner" }],
      [CHECK_OVERREACH]: DENIED,
      [CHECK_MIGRATIONS]: [{ n: 1 }],
    });
    await checkPlanner(handle);
    // The caller owns the lifecycle: `require-planner` ends it in a finally,
    // and the minting commands keep it open for the write that follows.
    expect(handle.ended).toBe(false);
  });
});
