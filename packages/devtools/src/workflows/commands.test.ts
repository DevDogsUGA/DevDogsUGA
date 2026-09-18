import { describe, expect, it, vi } from "vitest";
import {
  isWranglerDevConnectionFailure,
  isWranglerDevRunning,
  renderWranglerEnvFile,
  waitForLocalWorkflow,
  workflowChoices,
  workflowTriggerArgs,
  wranglerDevArgs,
  wranglerDevConnectionHint,
  wranglerDevNotRunningHint,
} from "./commands.js";

const configs = [
  {
    app: "schedule-builder",
    path: "/repo/apps/schedule-builder/wrangler.jsonc",
    config: {
      workflows: [
        {
          binding: "SCRAPE_WORKFLOW",
          name: "development-schedule-builder-scrape",
          class_name: "ScrapeWorkflow",
        },
      ],
      env: {
        production: {
          workflows: [
            {
              binding: "SCRAPE_WORKFLOW",
              name: "production-schedule-builder-scrape",
              class_name: "ScrapeWorkflow",
            },
          ],
        },
      },
    },
  },
] as const;

describe("workflowChoices", () => {
  it("derives names, bindings and classes from the selected Wrangler tier", () => {
    expect(workflowChoices(configs, ["production"])).toEqual([
      {
        app: "schedule-builder",
        tier: "production",
        binding: "SCRAPE_WORKFLOW",
        name: "production-schedule-builder-scrape",
        className: "ScrapeWorkflow",
      },
    ]);
  });
});

describe("workflowTriggerArgs", () => {
  const production = workflowChoices(configs, ["production"])[0]!;
  const development = workflowChoices(configs, ["development"])[0]!;

  it("targets a deployed Wrangler environment", () => {
    expect(workflowTriggerArgs(production, {})).toEqual([
      "--filter",
      "schedule-builder",
      "exec",
      "wrangler",
      "workflows",
      "trigger",
      "production-schedule-builder-scrape",
      "--env",
      "production",
    ]);
  });

  it("targets the local Wrangler session and passes JSON parameters", () => {
    expect(
      workflowTriggerArgs(development, {
        params: "{}",
        port: "9999",
        instanceId: "instance-123",
      }),
    ).toEqual([
      "--filter",
      "schedule-builder",
      "exec",
      "wrangler",
      "workflows",
      "trigger",
      "development-schedule-builder-scrape",
      "{}",
      "--id",
      "instance-123",
      "--local",
      "--port",
      "9999",
    ]);
  });
});

describe("local Wrangler connection diagnostics", () => {
  it("renders only selected runtime variables for Wrangler", () => {
    expect(
      renderWranglerEnvFile(["API_URL", "DB_URL", "CRON_SECRET"], {
        API_URL: "http://127.0.0.1:54321",
        DB_URL: "postgres://local/db",
        UNRELATED_TOKEN: "must-not-reach-the-worker",
      }),
    ).toBe("API_URL='http://127.0.0.1:54321'\nDB_URL='postgres://local/db'\n");
  });

  it("quotes multiline and special-character values safely", () => {
    expect(
      renderWranglerEnvFile(["PRIVATE_KEY"], {
        PRIVATE_KEY: `line one's\nline "two"\\end`,
      }),
    ).toBe(`PRIVATE_KEY='line one's\nline "two"\\end'\n`);
  });

  it("probes Wrangler's Workflow API instead of treating any server as Wrangler", async () => {
    const wrangler = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ success: true, result: [] })),
      );
    const next = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("Not found", { status: 404 }));

    await expect(isWranglerDevRunning("9999", 100, wrangler)).resolves.toBe(
      true,
    );
    await expect(isWranglerDevRunning("3000", 100, next)).resolves.toBe(false);
    expect(wrangler).toHaveBeenCalledWith(
      "http://127.0.0.1:9999/cdn-cgi/local/explorer/api/workflows",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("waits for a triggered local Workflow to complete", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ success: true, result: { status: "running" } }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ success: true, result: { status: "complete" } }),
        ),
      );

    await expect(
      waitForLocalWorkflow("schedule scrape", "instance/123", "9999", {
        fetcher,
        pollMs: 0,
        timeoutMs: 1_000,
      }),
    ).resolves.toBe(0);
    expect(fetcher).toHaveBeenCalledWith(
      "http://127.0.0.1:9999/cdn-cgi/local/explorer/api/workflows/schedule%20scrape/instances/instance%2F123",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("returns failure when the local Workflow errors", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          result: {
            status: "errored",
            error: { name: "Error", message: "database unavailable" },
          },
        }),
      ),
    );

    await expect(
      waitForLocalWorkflow("scrape", "failed", "9999", { fetcher }),
    ).resolves.toBe(1);
  });

  it("returns failure when a completed Workflow reports application failures", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          result: {
            status: "complete",
            output: {
              termResults: [],
              failures: [
                { academicPeriod: 202702, error: "registrar unavailable" },
              ],
            },
          },
        }),
      ),
    );

    await expect(
      waitForLocalWorkflow("scrape", "partial", "9999", { fetcher }),
    ).resolves.toBe(1);
  });

  it("builds a non-interactive temporary Wrangler command", () => {
    expect(wranglerDevArgs("schedule-builder", "9999")).toEqual([
      "--filter",
      "schedule-builder",
      "exec",
      "wrangler",
      "dev",
      "--port",
      "9999",
      "--show-interactive-dev-session=false",
    ]);
  });

  it("recognizes Wrangler's local-session connection failure", () => {
    expect(
      isWranglerDevConnectionFailure(
        'Could not connect to local dev session on port 8787. Make sure "wrangler dev" is running.\n\nfetch failed',
      ),
    ).toBe(true);
    expect(isWranglerDevConnectionFailure("Workflow instance failed")).toBe(
      false,
    );
  });

  it("distinguishes wrangler dev from next dev and gives matching commands", () => {
    const hint = wranglerDevConnectionHint("schedule-builder", "9999");
    expect(hint).toContain("Wrangler's Worker runtime");
    expect(hint).toContain("`next dev`");
    expect(hint).toContain("does not register Cloudflare Workflow bindings");
    expect(hint).toContain(
      "pnpm devtools workflows serve --app schedule-builder --port 9999",
    );
    expect(hint).toContain("only this app's declared environment");
    expect(hint).toContain(
      "pnpm devtools workflows run --app schedule-builder --tier development --port 9999",
    );

    const missing = wranglerDevNotRunningHint("schedule-builder", "9999");
    expect(missing).toContain("no Wrangler dev session was found");
    expect(missing).toContain("`next dev` only serves the Next.js UI");
    expect(missing).toContain(
      "pnpm devtools workflows serve --app schedule-builder --port 9999",
    );
    expect(missing).toContain("--port <number>");
  });
});
