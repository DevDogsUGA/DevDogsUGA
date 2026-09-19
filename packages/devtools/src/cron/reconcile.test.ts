// Unit tests for the pure pieces of cron/commands: the reconciliation table
// (`reconcileMap`), the workflow scheduled-trigger URL builder, the origin
// reachability probe, and the not-running hints. None of these touch the
// filesystem — `reconcileMap` takes an already-parsed wrangler config — so the
// whole table is exercised in memory.
import { describe, expect, it } from "vitest";
import {
  cronChoices,
  devServerHint,
  originReachable,
  reconcileMap,
} from "./commands.js";
import type { AppCronMap } from "./discovery.js";

const TIERS = ["development", "staging", "production"] as const;

function map(overrides: Partial<AppCronMap> = {}): AppCronMap {
  return {
    app: "schedule-builder",
    path: "/fake/cloudflare/scheduled.ts",
    routes: {},
    workflows: {},
    ...overrides,
  };
}

/** A wrangler config where only `production` natively schedules the workflow,
 * matching the real schedule-builder shape. */
function scrapeConfig() {
  return {
    workflows: [{ binding: "SCRAPE_WORKFLOW", name: "development-sb-scrape" }],
    env: {
      staging: {
        triggers: { crons: [] },
        workflows: [{ binding: "SCRAPE_WORKFLOW", name: "staging-sb-scrape" }],
      },
      production: {
        triggers: { crons: [] as string[] },
        workflows: [
          {
            binding: "SCRAPE_WORKFLOW",
            name: "production-sb-scrape",
            schedules: ["5 14 * * *"],
          },
        ],
      },
    },
  };
}

describe("reconcileMap — workflow crons", () => {
  const workflowMap = map({
    workflows: {
      "5 14 * * *": { binding: "SCRAPE_WORKFLOW", label: "daily scrape" },
    },
  });

  it("marks a scheduled, bound workflow as ok with the tier's workflow name", () => {
    const rows = reconcileMap(workflowMap, scrapeConfig(), TIERS);
    const prod = rows.find((r) => r.tier === "production")!;
    expect(prod.kind).toBe("workflow");
    expect(prod.status).toBe("ok");
    expect(prod.binding).toBe("SCRAPE_WORKFLOW");
    expect(prod.workflowName).toBe("production-sb-scrape");
  });

  it("marks a workflow no tier schedules as never-fires", () => {
    const rows = reconcileMap(workflowMap, scrapeConfig(), TIERS);
    // staging binds SCRAPE_WORKFLOW but gives it no native schedule.
    expect(rows.find((r) => r.tier === "staging")!.status).toBe("never-fires");
    // development also binds it without a native schedule.
    expect(rows.find((r) => r.tier === "development")!.status).toBe(
      "never-fires",
    );
  });

  it("marks a scheduled workflow whose binding is unbound in that tier as misconfigured", () => {
    const config = scrapeConfig();
    config.env.production.workflows = []; // metadata exists, binding does not
    const prod = reconcileMap(workflowMap, config, TIERS).find(
      (r) => r.tier === "production",
    )!;
    expect(prod.status).toBe("misconfigured");
    expect(prod.workflowName).toBeUndefined();
  });

  it("flags a leftover Worker cron even when a native Workflow uses the same expression", () => {
    const config = scrapeConfig();
    config.env.production.triggers.crons = ["5 14 * * *"];
    const prod = reconcileMap(workflowMap, config, ["production"]);
    expect(prod).toEqual([
      expect.objectContaining({ kind: "workflow", status: "ok" }),
      expect.objectContaining({ kind: "route", status: "fires-nothing" }),
    ]);
  });
});

describe("reconcileMap — route crons and gaps", () => {
  it("keeps route reconciliation working alongside workflows", () => {
    const m = map({
      routes: { "0 0 * * *": { routes: ["/cron/x"], label: "nightly" } },
    });
    const config = {
      env: { production: { triggers: { crons: ["0 0 * * *"] } } },
    };
    const rows = reconcileMap(m, config, TIERS);
    expect(rows.find((r) => r.tier === "production")!.status).toBe("ok");
    expect(rows.find((r) => r.tier === "staging")!.status).toBe("never-fires");
  });

  it("flags a wrangler schedule matching neither map as fires-nothing", () => {
    const config = {
      env: { production: { triggers: { crons: ["7 7 * * *"] } } },
    };
    const rows = reconcileMap(map(), config, ["production"]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("fires-nothing");
  });
});

describe("cronChoices", () => {
  it("offers Worker-declared jobs even when a tier intentionally schedules none", () => {
    const m = map({
      routes: { "0 0 * * *": { routes: ["/cron/x"], label: "nightly" } },
    });
    const choices = cronChoices(
      [m],
      new Map([[m.app, { env: { staging: { triggers: { crons: [] } } } }]]),
      "staging",
    );
    expect(choices).toEqual([
      expect.objectContaining({
        app: "schedule-builder",
        expr: "0 0 * * *",
        scheduled: false,
      }),
    ]);
  });
});

describe("originReachable", () => {
  it("returns false when nothing is listening (connection refused)", async () => {
    // Port 1 is privileged and never bound by a dev server; the loopback
    // connect is refused immediately.
    await expect(originReachable("http://127.0.0.1:1", 500)).resolves.toBe(
      false,
    );
  });
});

describe("not-running hints", () => {
  it("devServerHint names the app's dev script", () => {
    const hint = devServerHint("schedule-builder", "http://localhost:3000");
    expect(hint).toContain("pnpm --filter schedule-builder dev");
    expect(hint).toContain("localhost:3000");
  });

  it("devServerHint degrades to a placeholder without an app", () => {
    expect(devServerHint(undefined, "http://localhost:3000")).toContain(
      "--filter <app>",
    );
  });
});
