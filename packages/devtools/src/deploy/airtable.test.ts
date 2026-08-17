/**
 * The two Airtable deploy steps, and the one property that matters most:
 * `deploy airtable-plan` CANNOT mutate the base.
 *
 * That claim is made three ways here, because a comment saying "it only reads"
 * is worth nothing on the job that runs from `main`:
 *
 *   1. every HTTP request the plan issues is a GET — measured through an
 *      injected fetch, including against an EMPTY base where a real scaffold
 *      would create seven tables;
 *   2. the plan asks for `need: "read"`, which never consults
 *      `AIRTABLE_APPLY_PAT`, so a job holding only the write token fails
 *      loudly instead of planning with it;
 *   3. the module graph — `deploy/airtable-plan.ts` does not import
 *      `scaffoldBase`, asserted from the source so that a later edit adding it
 *      turns this red rather than quietly widening what the plan can do.
 *
 * No sockets. `AirtableClient` takes a `fetch`, and both commands pass theirs
 * through, so every branch is chosen by the test.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSnapshot, type LiveTable } from "@devdogsuga/airtable";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PROJECT_ROOT } from "../instance.js";
import { runDeployAirtableApply } from "./airtable-apply.js";
import { runDeployAirtablePlan } from "./airtable-plan.js";
import { DeployError } from "./report.js";

const BASE = "appTESTTESTTEST01";

/**
 * The committed schema snapshot IS the base the registry agrees with, so
 * replaying it is a base that needs nothing — the `changed: false` case
 * without a hand-written fixture that could drift from the registry.
 */
const UP_TO_DATE: LiveTable[] = readSnapshot().tables;

interface Recorded {
  method: string;
  url: string;
}

/** Answers only the schema read; anything else is a test failure by shape. */
function recordingFetch(tables: LiveTable[]): {
  fetch: typeof globalThis.fetch;
  calls: Recorded[];
} {
  const calls: Recorded[] = [];
  const fetch: typeof globalThis.fetch = (input, init) => {
    calls.push({
      method: init?.method ?? "GET",
      url: typeof input === "string" ? input : String(input),
    });
    return Promise.resolve(
      new Response(JSON.stringify({ tables }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  };
  return { fetch, calls };
}

let dir: string;
let env: NodeJS.ProcessEnv;
const reported: string[] = [];
const report = (lines: readonly string[]): void => {
  reported.push(...lines);
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "airtable-deploy-"));
  // The two file paths are NOT injected, for the reason `preflight.test.ts`
  // gives: they are paths the environment already supplies, so pointing them
  // at a temp file asserts the real bytes rather than the fact of a call.
  env = {
    AIRTABLE_BASE_ID: BASE,
    GITHUB_OUTPUT: join(dir, "output"),
    GITHUB_STEP_SUMMARY: join(dir, "summary"),
  };
  reported.length = 0;
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const output = (): string => readFileSync(join(dir, "output"), "utf8");
const summary = (): string => readFileSync(join(dir, "summary"), "utf8");

describe("airtable-plan cannot mutate", () => {
  it("issues nothing but GETs against a base that needs SEVEN new tables", async () => {
    // The adversarial case. An empty base is exactly where a scaffold would do
    // the most: seven POSTs to /meta/bases/{base}/tables. The plan must still
    // make one GET and stop.
    const { fetch, calls } = recordingFetch([]);
    const verdict = await runDeployAirtablePlan({
      env: { ...env, AIRTABLE_PLAN_PAT: "plan" },
      fetch,
      report,
    });

    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call.method, `${call.method} ${call.url}`).toBe("GET");
    }
    // POSITIVE CONTROL: the plan really did find work to do, so "no POSTs" is
    // a refusal to write rather than a run that decided there was nothing.
    expect(verdict.changed).toBe(true);
    expect(verdict.plan.every((entry) => !entry.exists)).toBe(true);
  });

  it("does not name the mutating entry point anywhere in its CODE", () => {
    // The module-graph half. `runDeployAirtableApply` is the only path to the
    // scaffolder, and keeping the two commands in two files is what makes that
    // inspectable. A single file with a `--dry-run` branch would put the
    // mutation one typo away from the plan.
    //
    // Comments are stripped first, so the two headers stay free to explain
    // themselves — and so the assertion is about what the module DOES rather
    // than about what it says. A test that a prose edit can turn red is a test
    // people learn to work around.
    const strip = (path: string): string =>
      readFileSync(join(PROJECT_ROOT, path), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");

    expect(
      strip("packages/devtools/src/deploy/airtable-plan.ts"),
    ).not.toContain("scaffoldBase");
    // POSITIVE CONTROL: the same stripper over the sibling DOES find it, so
    // this is not asserting against a string that got lost with the comments.
    expect(strip("packages/devtools/src/deploy/airtable-apply.ts")).toContain(
      "scaffoldBase",
    );
  });

  it("refuses the write token rather than planning with it", async () => {
    // A job that somehow held AIRTABLE_APPLY_PAT must not quietly succeed:
    // the reviewer gate in front of that credential is the whole design.
    const { fetch, calls } = recordingFetch(UP_TO_DATE);
    await expect(
      runDeployAirtablePlan({
        env: { ...env, AIRTABLE_APPLY_PAT: "apply" },
        fetch,
        report,
      }),
    ).rejects.toThrow(DeployError);
    expect(calls).toEqual([]);
  });

  it("refuses by name when no read credential is set — never a silent no-op", async () => {
    // The failure this whole change exists to prevent is the OPPOSITE of a
    // throw: the old Airtable job was guarded on `secrets.X != ''` and passed
    // green for months without running. Missing credential must be red.
    const { fetch } = recordingFetch(UP_TO_DATE);
    const error = await runDeployAirtablePlan({ env, fetch, report }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(DeployError);
    expect((error as DeployError).message).toContain("read the base schema");
    // The detail is where the variable names go, and naming them is the
    // difference between a job somebody can fix and one they re-run.
    expect((error as DeployError).detail.join("\n")).toContain(
      "AIRTABLE_PLAN_PAT, AIRTABLE_PAT",
    );
  });
});

describe("airtable-plan reports", () => {
  it("writes changed=false and an up-to-date summary for a base that matches", async () => {
    const { fetch } = recordingFetch(UP_TO_DATE);
    const verdict = await runDeployAirtablePlan({
      env: { ...env, AIRTABLE_PLAN_PAT: "plan" },
      fetch,
      report,
    });

    expect(verdict.changed).toBe(false);
    expect(output()).toBe("changed=false\n");
    expect(summary()).toContain("Airtable schema plan — up to date");
    expect(summary()).toContain(BASE);
    expect(summary()).toContain("up to date");
  });

  it("writes changed=true and names each table it would create", async () => {
    const { fetch } = recordingFetch([]);
    await runDeployAirtablePlan({
      env: { ...env, AIRTABLE_PLAN_PAT: "plan" },
      fetch,
      report,
    });

    expect(output()).toBe("changed=true\n");
    const text = summary();
    expect(text).toContain("Airtable schema plan — changes pending");
    for (const table of UP_TO_DATE) {
      expect(text, `${table.name} missing from the plan`).toContain(
        `+ table ${table.name}`,
      );
    }
  });

  it("says which variable it authenticated with", async () => {
    // Because the read row can resolve to either of two tokens, and a 403 on
    // a records read only makes sense once you know which one won.
    const { fetch } = recordingFetch(UP_TO_DATE);
    await runDeployAirtablePlan({
      env: { ...env, AIRTABLE_PLAN_PAT: "plan", AIRTABLE_PAT: "full" },
      fetch,
      report,
    });
    expect(reported.join("\n")).toContain("with AIRTABLE_PLAN_PAT");
  });
});

describe("airtable-apply", () => {
  it("creates nothing against a base that already matches", async () => {
    // Idempotence, which the gated apply job depends on: a re-run after a
    // partial failure must not double-create.
    const { fetch, calls } = recordingFetch(UP_TO_DATE);
    const result = await runDeployAirtableApply({
      env: { ...env, AIRTABLE_APPLY_PAT: "apply" },
      fetch,
      report,
    });

    expect(result).toEqual({ tables: 0, fields: 0 });
    for (const call of calls) expect(call.method).toBe("GET");
    expect(summary()).toContain("Airtable schema apply");
  });

  it("uses the apply token in preference to the operator one", async () => {
    const { fetch } = recordingFetch(UP_TO_DATE);
    await runDeployAirtableApply({
      env: { ...env, AIRTABLE_APPLY_PAT: "apply", AIRTABLE_PAT: "full" },
      fetch,
      report,
    });
    expect(reported.join("\n")).toContain("with AIRTABLE_APPLY_PAT");
  });

  it("never falls back to the plan token", async () => {
    // It cannot write. Falling back would turn a named refusal into a 403
    // partway through a schema change, with the base half modified.
    const { fetch, calls } = recordingFetch(UP_TO_DATE);
    const error = await runDeployAirtableApply({
      env: { ...env, AIRTABLE_PLAN_PAT: "plan" },
      fetch,
      report,
    }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(DeployError);
    expect((error as DeployError).detail.join("\n")).toContain(
      "AIRTABLE_APPLY_PAT, AIRTABLE_PAT",
    );
    expect(calls).toEqual([]);
  });

  it("fails loudly when the base still lacks something afterwards", async () => {
    // Airtable refused a field, or the scaffolder has a bug. A green apply
    // there is a lie the next sync discovers, and `pull-ids` run against it
    // would commit a half-placeholder registry that LOOKS finished.
    //
    // Driven by a base whose tables exist but whose fields do not: the
    // scaffolder issues its creates, this fake answers each one with the same
    // unchanged schema, and `discoverIds` then reports what is still missing.
    const stripped: LiveTable[] = UP_TO_DATE.map((t) => ({
      ...t,
      fields: t.fields.slice(0, 1),
    }));
    const fetch: typeof globalThis.fetch = () =>
      Promise.resolve(
        new Response(JSON.stringify({ tables: stripped }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

    await expect(
      runDeployAirtableApply({
        env: { ...env, AIRTABLE_APPLY_PAT: "apply" },
        fetch,
        report,
      }),
    ).rejects.toThrow(/still lacks/);
    expect(summary()).toContain("INCOMPLETE");
  });
});
