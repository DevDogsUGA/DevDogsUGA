/*
 * Re-homed from packages/devtools/src/cron/contract.test.ts. Rewritten as a
 * black-box run of the installed devtools bin instead of importing
 * devtools' CronRoutes/WorkflowCrons schemas and PROJECT_ROOT directly —
 * neither is part of @devdogsuga/devtools's published "exports" (it
 * declares none; only its two bins are a real contract). devtools cron list
 * --json performs exactly the validation the old test re-implemented by
 * hand: it dynamically imports every apps/star/cloudflare/scheduled.ts that
 * exists and zod-validates CRON_ROUTES (required) / WORKFLOW_CRONS
 * (optional) against the same contract shapes, throwing — and so exiting
 * non-zero here — on the first violation. Apps with no scheduled.ts (e.g.
 * sandbox) are skipped by the command itself, not by this test.
 *
 * (Note: this file's comments avoid backtick characters entirely — a
 * literal backtick anywhere in a block comment here reliably breaks this
 * workspace's vite/oxc transform with a spurious "Cannot assign to this
 * expression" parse error, confirmed by bisection while writing this test.
 * Worth a closer look if seen elsewhere in this package.)
 */
import { describe, expect, it } from "vitest";
import { pnpmExec } from "./pnpm-exec.js";

interface CronListRow {
  app: string;
  tier: string;
  expr: string;
  label: string;
  kind: "route" | "workflow";
  status: "ok" | "never-fires" | "fires-nothing" | "misconfigured";
}

/**
 * The installed "devtools" bin (unlike "devtools-ci") wraps every command in
 * a clack intro/outro banner on stdout, so "--json" output is a JSON array
 * sandwiched between decorative lines, not the whole stream. Slice out the
 * substring between the first "[" and the matching last "]".
 */
function extractJsonArray(stdout: string): unknown {
  const start = stdout.indexOf("[");
  const end = stdout.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`no JSON array found in stdout:\n${stdout}`);
  }
  return JSON.parse(stdout.slice(start, end + 1));
}

describe("CRON_ROUTES / WORKFLOW_CRONS contract (via devtools cron list)", () => {
  it("every real apps/*/cloudflare/scheduled.ts validates against the cron contract", async () => {
    // --tier development:local (qualified) rather than bare "development":
    // every devtools command resolves a SESSION tier before dispatch
    // (confirmed empirically), and this repo's local .env names a remote
    // database, which makes bare "development" ambiguous between it and the
    // Docker stack. DEV_DB=local is the non-interactive equivalent.
    // cron list's OWN --tier reconciles a specific tier's Worker/Workflow
    // schedules; left unset here (the session --tier above is consumed by
    // launch.ts before cron list ever parses argv) it reports development,
    // staging AND production rows in one call, which is what this test wants
    // — every declared tier's contract validated in one pass.
    const result = await pnpmExec(
      "devtools",
      ["cron", "list", "--tier", "development:local", "--json"],
      { DEV_DB: "local" },
    );

    // Not asserted empty: devtools' dlx preflight (src/repo/preflight.ts in
    // Backstage) runs on every devtools invocation and fails OPEN with a
    // one-line stderr notice when it cannot reach the minimums manifest —
    // expected and harmless in an offline/sandboxed test run. A genuine
    // contract violation instead throws and produces a non-zero exit.
    expect(
      result.code,
      `devtools cron list exited non-zero:\n${result.stderr}`,
    ).toBe(0);
    expect(
      result.stderr,
      "no CRON_ROUTES/WORKFLOW_CRONS validation failure",
    ).not.toMatch(/does not match the required shape/);

    const rows = extractJsonArray(result.stdout) as CronListRow[];
    const appsSeen = new Set(rows.map((row) => row.app));

    // Both real apps that ship a cloudflare/scheduled.ts must have been
    // reachable and contract-valid for their rows to exist at all — an
    // empty or missing entry here means discovery silently found nothing,
    // which would make the rest of this test pass vacuously.
    expect(appsSeen.has("platform"), "platform rows present").toBe(true);
    expect(
      appsSeen.has("schedule-builder"),
      "schedule-builder rows present",
    ).toBe(true);

    // Every route/workflow entry must carry a non-blank label — the same
    // per-entry shape assertion the in-process version made after a
    // successful zod parse.
    for (const row of rows) {
      expect(
        row.label.trim().length,
        `${row.app} ${row.expr} label`,
      ).toBeGreaterThan(0);
    }
  });
});
