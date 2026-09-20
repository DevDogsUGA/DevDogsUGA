import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `runWorkflowsRun`'s own dependencies, faked at the module boundary for the
 * "remote-trigger env" tests near the bottom of this file: `discoverWranglerConfigs`
 * so the Workflow picker sees one controlled app instead of walking `apps/*`
 * on disk, `runWithStderr` so no `pnpm exec wrangler` ever actually spawns,
 * and `@devdogsuga/env/load` so a deployed tier's credentials come from a
 * fixture rather than a real `.env.staging`. Every other test in this file
 * exercises a pure helper directly and needs none of this.
 */
const fixtures = vi.hoisted(() => ({
  configs: [
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
          staging: {
            workflows: [
              {
                binding: "SCRAPE_WORKFLOW",
                name: "staging-schedule-builder-scrape",
                class_name: "ScrapeWorkflow",
              },
            ],
          },
        },
      },
    },
  ],
}));

vi.mock("../cron/discovery.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../cron/discovery.js")>()),
  discoverWranglerConfigs: vi.fn(() => fixtures.configs),
}));

vi.mock("../db/run.js", () => ({
  runWithStderr: vi.fn(async () => ({ code: 0, stderr: "" })),
  run: vi.fn(async () => 0),
}));

vi.mock("@devdogsuga/env/load", () => ({
  loadEnvironment: vi.fn(async () => ({
    environment: "staging",
    files: [],
    env: { CLOUDFLARE_API_TOKEN: "tkn" },
    warnings: [],
  })),
  MissingEnvFileError: class MissingEnvFileError extends Error {},
}));

const {
  isWranglerDevConnectionFailure,
  isWranglerDevRunning,
  renderWranglerEnvFile,
  runWorkflowsRun,
  waitForLocalWorkflow,
  workflowChoices,
  workflowTriggerArgs,
  wranglerDevArgs,
  wranglerDevConnectionHint,
  wranglerDevNotRunningHint,
} = await import("./commands.js");
const { runWithStderr } = await import("../db/run.js");
const { loadEnvironment, MissingEnvFileError } =
  await import("@devdogsuga/env/load");

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

/**
 * `runWorkflowsRun`'s remote-trigger env: for any tier but development it
 * loads that tier's own credentials with `loadEnvironment(tier, { override:
 * true })` and threads them to `runWithStderr` as the child's env, rather
 * than leaving `wrangler workflows trigger` to whatever this process
 * inherited — development's values, since `pnpm devtools` itself runs under
 * `with-env`. `--tier`, `--workflow` and `--yes` are all passed so the run
 * never reaches a prompt: `pickTier` and the Workflow picker both defer to a
 * given flag, and `--yes` stands in for the deployed-tier confirm.
 */
describe("runWorkflowsRun remote-trigger env", () => {
  beforeEach(() => {
    vi.mocked(runWithStderr)
      .mockClear()
      .mockResolvedValue({ code: 0, stderr: "" });
    vi.mocked(loadEnvironment)
      .mockReset()
      .mockResolvedValue({
        environment: "staging",
        files: [],
        env: { CLOUDFLARE_API_TOKEN: "tkn" },
        warnings: [],
      });
  });

  it("threads the loaded tier's env to the trigger, not this process's own", async () => {
    const code = await runWorkflowsRun([
      "--tier",
      "staging",
      "--workflow",
      "staging-schedule-builder-scrape",
      "--yes",
    ]);

    expect(code).toBe(0);
    expect(runWithStderr).toHaveBeenCalledOnce();
    const triggerEnv = vi.mocked(runWithStderr).mock.calls[0]![1] as
      Record<string, string> | undefined;
    expect(triggerEnv?.CLOUDFLARE_API_TOKEN).toBe("tkn");
  });

  it("triggers nothing and returns 1 when the tier's env file is missing", async () => {
    vi.mocked(loadEnvironment).mockRejectedValueOnce(
      new MissingEnvFileError(
        ".env.staging does not exist. Run `pnpm devtools env pull --target staging` to fetch it.",
      ),
    );

    const code = await runWorkflowsRun([
      "--tier",
      "staging",
      "--workflow",
      "staging-schedule-builder-scrape",
      "--yes",
    ]);

    expect(code).toBe(1);
    expect(runWithStderr).not.toHaveBeenCalled();
  });
});
