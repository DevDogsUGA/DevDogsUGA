/** Config-derived listing and manual triggering for Cloudflare Workflows. */
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { confirm, select, text } from "@clack/prompts";
import { MissingEnvFileError, loadEnvironment } from "@devdogsuga/env/load";
import {
  createTemporaryWranglerEnv,
  renderWranglerEnvFile,
} from "../cf/local-env.js";
import { runWithStderr } from "../db/run.js";
import { PROJECT_ROOT } from "../environment.js";
import { recordResolved } from "../invocation.js";
import { resolveTier } from "../tier.js";
import { unwrap } from "../ui.js";
import {
  CRON_TIERS,
  discoverWranglerConfigs,
  isCronTier,
  workflowsForTier,
  type AppWranglerConfig,
  type CronTier,
} from "../cron/discovery.js";

export interface WorkflowChoice {
  app: string;
  tier: CronTier;
  binding: string;
  name: string;
  className?: string;
}

interface WorkflowOptions {
  app?: string;
  tier?: string;
  workflow?: string;
  params?: string;
  port?: string;
  yes: boolean;
  json: boolean;
  instanceId?: string;
}

interface TemporaryWranglerSession {
  stop: () => Promise<void>;
  /** The port the session actually bound to — may differ from the requested
   * one when it was already taken. See `startTemporaryWrangler`. */
  port: string;
}

export { renderWranglerEnvFile } from "../cf/local-env.js";

// A clean OpenNext checkout builds before Wrangler can boot. Keep showing that
// build's inherited output and allow enough time for a production Next build.
const WRANGLER_READY_TIMEOUT_MS = 5 * 60_000;
const LOCAL_WORKFLOW_TIMEOUT_MS = 60 * 60_000;
const WRANGLER_PROBE_PATH = "/cdn-cgi/local/explorer/api/workflows";

export function workflowChoices(
  configs: readonly AppWranglerConfig[],
  tiers: readonly CronTier[] = CRON_TIERS,
): WorkflowChoice[] {
  return configs
    .flatMap(({ app, config }) =>
      tiers.flatMap((tier) =>
        workflowsForTier(config, tier).map((workflow) => ({
          app,
          tier,
          binding: workflow.binding,
          name: workflow.name,
          className: workflow.class_name,
        })),
      ),
    )
    .sort(
      (a, b) =>
        a.app.localeCompare(b.app) ||
        a.tier.localeCompare(b.tier) ||
        a.name.localeCompare(b.name),
    );
}

function parseOptions(argv: readonly string[]): WorkflowOptions {
  const options: WorkflowOptions = {
    yes: argv.includes("--yes"),
    json: argv.includes("--json"),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === "--app") options.app = value;
    else if (flag === "--tier") options.tier = value;
    else if (flag === "--workflow") options.workflow = value;
    else if (flag === "--params") options.params = value;
    else if (flag === "--port") options.port = value;
  }
  return options;
}

function validateTier(
  value: string | undefined,
  command: "list" | "run",
): CronTier | undefined | null {
  if (value === undefined) return undefined;
  if (isCronTier(value)) return value;
  process.stderr.write(
    `devtools workflows ${command}: unknown tier "${value}". Expected: ${CRON_TIERS.join(", ")}.\n`,
  );
  return null;
}

export function workflowTriggerArgs(
  choice: WorkflowChoice,
  options: Pick<WorkflowOptions, "params" | "port" | "instanceId">,
): string[] {
  const args = [
    "--filter",
    choice.app,
    "exec",
    "wrangler",
    "workflows",
    "trigger",
    choice.name,
  ];
  if (options.params) args.push(options.params);
  if (options.instanceId) args.push("--id", options.instanceId);
  if (choice.tier === "development") {
    args.push("--local", "--port", options.port ?? "8787");
  } else {
    args.push("--env", choice.tier);
  }
  return args;
}

interface LocalWorkflowInstance {
  status?: string;
  error?: { name?: string; message?: string };
  output?: unknown;
}

interface LocalWorkflowEnvelope {
  success?: boolean;
  result?: LocalWorkflowInstance;
  errors?: Array<{ message?: string }>;
}

/** Wait until a locally-triggered instance finishes before its server is stopped. */
export async function waitForLocalWorkflow(
  workflowName: string,
  instanceId: string,
  port: string,
  options: {
    timeoutMs?: number;
    pollMs?: number;
    fetcher?: typeof fetch;
  } = {},
): Promise<number> {
  const timeoutMs = options.timeoutMs ?? LOCAL_WORKFLOW_TIMEOUT_MS;
  const pollMs = options.pollMs ?? 500;
  const fetcher = options.fetcher ?? fetch;
  const deadline = Date.now() + timeoutMs;
  const url =
    `http://127.0.0.1:${port}${WRANGLER_PROBE_PATH}/` +
    `${encodeURIComponent(workflowName)}/instances/${encodeURIComponent(instanceId)}`;
  let previousStatus: string | undefined;

  while (Date.now() < deadline) {
    const response = await fetcher(url, {
      signal: AbortSignal.timeout(2_000),
    });
    if (response.status === 404) {
      await delay(pollMs);
      continue;
    }
    if (!response.ok) {
      throw new Error(
        `Wrangler returned HTTP ${response.status} while checking Workflow instance ${instanceId}.`,
      );
    }

    const envelope = (await response.json()) as LocalWorkflowEnvelope;
    if (envelope.success !== true || !envelope.result) {
      const message = envelope.errors?.[0]?.message ?? "unknown Wrangler error";
      throw new Error(
        `Could not read Workflow instance ${instanceId}: ${message}`,
      );
    }
    const { status, error } = envelope.result;
    if (status && status !== previousStatus) {
      process.stdout.write(`Workflow ${instanceId}: ${status}\n`);
      previousStatus = status;
    }
    if (status === "complete") {
      const output = envelope.result.output;
      const failures =
        typeof output === "object" &&
        output !== null &&
        "failures" in output &&
        Array.isArray(output.failures)
          ? output.failures
          : [];
      if (failures.length > 0) {
        process.stderr.write(
          `devtools workflows run: Workflow ${instanceId} completed with ${failures.length} recorded failure${failures.length === 1 ? "" : "s"}:\n`,
        );
        for (const failure of failures) {
          if (typeof failure === "object" && failure !== null) {
            const period =
              "academicPeriod" in failure
                ? String(failure.academicPeriod)
                : "unknown item";
            const message =
              "error" in failure ? String(failure.error) : "unknown error";
            process.stderr.write(`  - ${period}: ${message}\n`);
          } else {
            process.stderr.write(`  - ${String(failure)}\n`);
          }
        }
        return 1;
      }
      return 0;
    }
    if (status === "errored" || status === "terminated") {
      const detail = error?.message
        ? `: ${error.name ? `${error.name}: ` : ""}${error.message}`
        : "";
      process.stderr.write(
        `devtools workflows run: Workflow ${instanceId} ${status}${detail}\n`,
      );
      return 1;
    }
    await delay(pollMs);
  }

  process.stderr.write(
    `devtools workflows run: Workflow ${instanceId} did not finish within ${Math.round(timeoutMs / 60_000)} minutes.\n`,
  );
  return 1;
}

export function wranglerDevArgs(app: string, port: string): string[] {
  return [
    "--filter",
    app,
    "exec",
    "wrangler",
    "dev",
    "--port",
    port,
    "--show-interactive-dev-session=false",
  ];
}

/** Probe Wrangler's Workflow explorer API, rather than merely checking a port. */
export async function isWranglerDevRunning(
  port: string,
  timeoutMs = 1_000,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const response = await fetcher(
      `http://127.0.0.1:${port}${WRANGLER_PROBE_PATH}`,
      { signal: AbortSignal.timeout(timeoutMs) },
    );
    if (!response.ok) return false;
    const payload = (await response.json()) as { success?: unknown };
    return payload.success === true;
  } catch {
    return false;
  }
}

function signalProcessGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined) return;
  try {
    if (process.platform === "win32") child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch {
    // It may have exited between the readiness/exit check and the signal.
  }
}

async function stopTemporaryWrangler(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  signalProcessGroup(child, "SIGINT");
  if (await waitForExit(child, 3_000)) return;
  signalProcessGroup(child, "SIGTERM");
  if (await waitForExit(child, 3_000)) return;
  signalProcessGroup(child, "SIGKILL");
  await waitForExit(child, 1_000);
}

async function waitForExit(
  child: ChildProcess,
  timeoutMs: number,
): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return Promise.race([
    new Promise<boolean>((resolve) => child.once("exit", () => resolve(true))),
    delay(timeoutMs).then(() => false),
  ]);
}

/** Whether nothing is bound to `port` on loopback — a real bind test, not a
 * connect probe, so it answers the only question that matters here: can Wrangler
 * take this port? */
export function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen({ host: "127.0.0.1", port }, () => {
      server.close(() => resolve(true));
    });
  });
}

/** The first free port at or after `from`, or null if a bounded scan finds
 * none. Bounded so an exhausted range fails loudly instead of looping. */
export async function findFreePort(
  from: number,
  attempts = 20,
): Promise<number | null> {
  for (let port = from; port < from + attempts && port <= 65_535; port += 1) {
    if (await isPortFree(port)) return port;
  }
  return null;
}

async function startTemporaryWrangler(
  app: string,
  requestedPort: string,
): Promise<TemporaryWranglerSession | null> {
  // Auto-pick a free port when the requested one is taken. The usual culprit is
  // another project's `wrangler dev` holding the default 8787; without this,
  // `wrangler dev --port <taken>` cannot bind and the session never becomes
  // ready — read as "triggering a workflow is broken" rather than "that port is
  // busy". The trigger below uses whatever port we actually bound.
  let port = requestedPort;
  if (!(await isPortFree(Number(port)))) {
    const free = await findFreePort(Number(port) + 1);
    if (free === null) {
      process.stderr.write(
        `devtools workflows: port ${requestedPort} is in use and no free port ` +
          `was found near it for a temporary Wrangler session.\n`,
      );
      return null;
    }
    process.stdout.write(
      `Port ${requestedPort} is in use; starting the temporary Wrangler session on ${free} instead.\n`,
    );
    port = String(free);
  }

  process.stdout.write(
    `Preparing and starting a temporary Wrangler session for ${app} on port ${port}…\n`,
  );

  // Both callers of this function (`workflows serve`, `workflows run --tier
  // development`) are local-only, so the tier is always development — but
  // load it explicitly rather than letting the scoped `.dev.vars` fall back
  // to this process's own inherited env: `override: true` re-reads `.env`
  // fresh, so an edit made after this process started is picked up instead
  // of a value it happened to inherit at boot.
  let loaded: Awaited<ReturnType<typeof loadEnvironment>>;
  try {
    loaded = await loadEnvironment("development", { override: true });
  } catch (err) {
    if (err instanceof MissingEnvFileError) {
      process.stderr.write(`devtools workflows: ${err.message}\n`);
      return null;
    }
    throw err;
  }

  const runtimeEnv = await createTemporaryWranglerEnv(app, loaded.env);
  const child = spawn(
    "pnpm",
    [...wranglerDevArgs(app, port), "--env-file", runtimeEnv.path],
    {
      cwd: PROJECT_ROOT,
      stdio: "inherit",
      detached: process.platform !== "win32",
    },
  );
  let startupError: Error | undefined;
  child.once("error", (error) => {
    startupError = error;
  });

  const deadline = Date.now() + WRANGLER_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await isWranglerDevRunning(port)) {
      process.stdout.write("Wrangler is ready.\n");
      const stopOnParentExit = () => {
        signalProcessGroup(child, "SIGTERM");
        runtimeEnv.remove();
      };
      process.once("exit", stopOnParentExit);
      return {
        stop: async () => {
          process.off("exit", stopOnParentExit);
          await stopTemporaryWrangler(child);
          runtimeEnv.remove();
        },
        port,
      };
    }
    if (startupError || child.exitCode !== null || child.signalCode !== null) {
      process.stderr.write(
        `devtools workflows run: Wrangler stopped before it became ready${
          startupError ? `: ${startupError.message}` : "."
        }\n`,
      );
      runtimeEnv.remove();
      return null;
    }
    await delay(250);
  }

  await stopTemporaryWrangler(child);
  runtimeEnv.remove();
  process.stderr.write(
    `devtools workflows run: Wrangler did not become ready on port ${port} within 5 minutes.\n`,
  );
  return null;
}

type MissingWranglerAction = "start" | "port" | "cancel";

async function prepareLocalWrangler(
  app: string,
  initialPort: string,
): Promise<{ port: string; temporary?: TemporaryWranglerSession } | undefined> {
  let port = initialPort;
  while (!(await isWranglerDevRunning(port))) {
    if (!process.stdin.isTTY) {
      process.stderr.write(wranglerDevNotRunningHint(app, port));
      return undefined;
    }

    const action = unwrap(
      await select<MissingWranglerAction>({
        message: `No Wrangler dev session was found on port ${port}.`,
        options: [
          {
            value: "start",
            label: "Start Wrangler temporarily",
            hint: "stop it after this Workflow is triggered",
          },
          {
            value: "port",
            label: "Use another port",
            hint: "Wrangler may already be running there",
          },
          { value: "cancel", label: "Cancel" },
        ],
      }),
    );

    if (action === "cancel") return undefined;
    if (action === "port") {
      port = unwrap(
        await text({
          message: "Which port is wrangler dev using?",
          placeholder: "8787",
          validate: validatePort,
        }),
      ).trim();
      continue;
    }

    const temporary = await startTemporaryWrangler(app, port);
    // `temporary.port` — not `port` — because the session may have landed on a
    // different port when the requested one was taken; the trigger must aim at
    // where Wrangler actually came up.
    return temporary ? { port: temporary.port, temporary } : undefined;
  }
  return { port };
}

function validatePort(value: string | undefined): string | undefined {
  if (!value || !/^\d+$/.test(value)) return "Enter a port number.";
  const port = Number(value);
  if (port < 1 || port > 65_535) return "Enter a port from 1 to 65535.";
  return undefined;
}

export function isWranglerDevConnectionFailure(stderr: string): boolean {
  return /Could not connect to local dev session on port \d+[\s\S]*Make sure ["“]wrangler dev["”] is running/i.test(
    stderr,
  );
}

export function wranglerDevConnectionHint(app: string, port: string): string {
  return (
    "\nThe local Workflow trigger connects to Wrangler's Worker runtime, not " +
    "the Next.js development server. `next dev` renders the web app, but it " +
    "does not register Cloudflare Workflow bindings or expose Wrangler's " +
    "local control API.\n\n" +
    "Start a separate app-scoped Wrangler session, then retry the trigger:\n" +
    `  pnpm devtools workflows serve --app ${app} --port ${port}\n` +
    `  pnpm devtools workflows run --app ${app} --tier development --port ${port}\n\n` +
    "The serve command loads only this app's declared environment. Keep " +
    "`next dev` running too if you also need the Next.js development UI.\n"
  );
}

export function wranglerDevNotRunningHint(app: string, port: string): string {
  return (
    `devtools workflows run: no Wrangler dev session was found on port ${port}.\n` +
    "A local Workflow needs Wrangler's Worker runtime; `next dev` only serves " +
    "the Next.js UI and does not register Workflow bindings.\n" +
    `Start it with: pnpm devtools workflows serve --app ${app} --port ${port}\n` +
    `If Wrangler uses another port, rerun this command with --port <number>.\n`
  );
}

export async function runWorkflowsList(
  argv: readonly string[],
): Promise<number> {
  const options = parseOptions(argv);
  const tier = validateTier(options.tier, "list");
  if (tier === null) return 1;
  let choices = workflowChoices(
    discoverWranglerConfigs(),
    tier ? [tier] : CRON_TIERS,
  );
  if (options.app) choices = choices.filter((item) => item.app === options.app);

  if (options.json) {
    process.stdout.write(`${JSON.stringify(choices, null, 2)}\n`);
    return 0;
  }
  if (choices.length === 0) {
    process.stdout.write("(no configured Workflows found)\n");
    return 0;
  }
  for (const item of choices) {
    process.stdout.write(
      `${item.app}  [${item.tier}]\n` +
        `  ${item.name}\n` +
        `    binding: ${item.binding}${item.className ? ` · class: ${item.className}` : ""}\n`,
    );
  }
  return 0;
}

export async function runWorkflowsRun(
  argv: readonly string[],
): Promise<number> {
  const options = parseOptions(argv);
  // What arrived as a flag versus what a prompt will decide — only the latter
  // is worth recording for the "skip the prompts next time" line, since a flag
  // is already in the recorded base argv.
  const givenApp = options.app;
  const givenTier = options.tier;
  const givenWorkflow = options.workflow;
  const givenPort = options.port;
  const tier = await resolveTier(
    options.tier,
    "Which tier should receive the Workflow?",
    { label: "devtools workflows run" },
  );
  if (!tier) return 1;

  if (options.params) {
    try {
      JSON.parse(options.params);
    } catch {
      process.stderr.write(
        "devtools workflows run: --params must be valid JSON.\n",
      );
      return 1;
    }
  }
  if (options.port) {
    const error = validatePort(options.port);
    if (error) {
      process.stderr.write(
        "devtools workflows run: --port must be an integer from 1 to 65535.\n",
      );
      return 1;
    }
  }

  let choices = workflowChoices(discoverWranglerConfigs(), [tier]);
  if (options.app) choices = choices.filter((item) => item.app === options.app);

  let choice: WorkflowChoice | undefined;
  if (options.workflow) {
    const matches = choices.filter(
      (item) =>
        item.name === options.workflow || item.binding === options.workflow,
    );
    if (matches.length > 1 && !options.app) {
      process.stderr.write(
        `devtools workflows run: "${options.workflow}" is ambiguous; pass --app.\n`,
      );
      return 1;
    }
    choice = matches[0];
  } else if (process.stdin.isTTY) {
    if (choices.length > 0) {
      choice = unwrap(
        await select<WorkflowChoice>({
          message: "Which Workflow should run?",
          options: choices.map((item) => ({
            value: item,
            label: `${item.app} · ${item.name}`,
            hint: `${item.binding}${item.className ? ` · ${item.className}` : ""}`,
          })),
        }),
      );
    }
  }

  if (!choice) {
    process.stderr.write(
      options.workflow
        ? `devtools workflows run: no configured Workflow named "${options.workflow}" for ${tier}.\n`
        : "devtools workflows run: no Workflow was selected; pass --workflow when no terminal is available.\n",
    );
    return 1;
  }

  if (tier !== "development" && !options.yes) {
    if (!process.stdin.isTTY) {
      process.stderr.write(
        `devtools workflows run: --yes is required to trigger ${tier}.\n`,
      );
      return 1;
    }
    const approved = unwrap(
      await confirm({
        message: `Trigger ${choice.name} on ${tier}?`,
        initialValue: false,
      }),
    );
    if (!approved) return 1;
  }

  let local: { port: string; temporary?: TemporaryWranglerSession } | undefined;
  if (tier === "development") {
    local = await prepareLocalWrangler(choice.app, options.port ?? "8787");
    if (!local) return 1;
    options.port = local.port;
    // A successful trigger only means "queued". Keep the exact instance ID so
    // we can wait for its terminal status before stopping a temporary server.
    options.instanceId = randomUUID();
  }

  // A remote trigger (`wrangler workflows trigger --env <tier>`) authenticates
  // against Cloudflare with that tier's own credentials, which live only in
  // `.env.<tier>` — never in this process's own inherited env, which is
  // development's. Loading it here, rather than leaving the child to whatever
  // this process happened to inherit, is an accepted behavior change: a
  // remote trigger now requires `.env.<tier>` to be present and authenticates
  // with ITS credentials, not development's. The local path needs none of
  // this — the temporary Wrangler session already carries development's env.
  let triggerEnv: NodeJS.ProcessEnv | undefined;
  if (tier !== "development") {
    try {
      triggerEnv = (await loadEnvironment(tier, { override: true })).env;
    } catch (err) {
      if (err instanceof MissingEnvFileError) {
        process.stderr.write(`devtools workflows run: ${err.message}\n`);
        return 1;
      }
      throw err;
    }
  }

  // Record the decisions the prompts made, in flag form, so the CLI can print
  // a command that reruns this without any of them. `--yes` is deliberately
  // never recorded: it exists to gate a deployed trigger behind a confirm, and
  // a copy-pasteable line that skips that confirm would be a footgun. `--app`
  // is inferred from the chosen Workflow when it was not passed.
  if (givenApp === undefined) recordResolved("--app", choice.app);
  if (givenWorkflow === undefined) recordResolved("--workflow", choice.binding);
  if (givenTier === undefined) recordResolved("--tier", tier);
  if (givenPort === undefined && options.port && options.port !== "8787")
    recordResolved("--port", options.port);

  process.stdout.write(`→ ${choice.name} (${choice.app}, ${tier})\n`);
  try {
    const result = await runWithStderr(
      workflowTriggerArgs(choice, options),
      triggerEnv,
    );
    if (
      result.code !== 0 &&
      tier === "development" &&
      isWranglerDevConnectionFailure(result.stderr)
    ) {
      process.stderr.write(
        wranglerDevConnectionHint(choice.app, options.port ?? "8787"),
      );
    }
    if (result.code === 0 && tier === "development" && options.instanceId) {
      try {
        return await waitForLocalWorkflow(
          choice.name,
          options.instanceId,
          options.port ?? "8787",
        );
      } catch (error) {
        process.stderr.write(
          `devtools workflows run: ${error instanceof Error ? error.message : String(error)}\n`,
        );
        return 1;
      }
    }
    return result.code;
  } finally {
    if (local?.temporary) {
      process.stdout.write("Stopping the temporary Wrangler session…\n");
      await local.temporary.stop();
    }
  }
}

export async function runWorkflowsServe(
  argv: readonly string[],
): Promise<number> {
  const options = parseOptions(argv);
  const port = options.port ?? "8787";
  if (validatePort(port)) {
    process.stderr.write(
      "devtools workflows serve: --port must be an integer from 1 to 65535.\n",
    );
    return 1;
  }

  const apps = [
    ...new Set(
      workflowChoices(discoverWranglerConfigs(), ["development"]).map(
        ({ app }) => app,
      ),
    ),
  ];
  let app = options.app;
  if (app && !apps.includes(app)) {
    process.stderr.write(
      `devtools workflows serve: no development Workflow is configured for "${app}".\n`,
    );
    return 1;
  }
  if (!app && process.stdin.isTTY) {
    app = unwrap(
      await select<string>({
        message: "Which app's Workflow runtime should start?",
        options: apps.map((value) => ({ value, label: value })),
      }),
    );
  }
  if (!app) {
    process.stderr.write(
      "devtools workflows serve: pass --app when no terminal is available.\n",
    );
    return 1;
  }

  // Record an app chosen at the prompt (a non-default port too), so the rerun
  // line can start the same session without the picker.
  if (options.app === undefined) recordResolved("--app", app);
  if (options.port === undefined && port !== "8787") {
    recordResolved("--port", port);
  }

  if (await isWranglerDevRunning(port)) {
    process.stderr.write(
      `devtools workflows serve: Wrangler is already running on port ${port}.\n`,
    );
    return 1;
  }
  const session = await startTemporaryWrangler(app, port);
  if (!session) return 1;

  // `session.port`, not `port`: the session auto-picks a free port when the
  // requested one is taken, so this line must report where it actually landed.
  process.stdout.write(
    `Wrangler will keep running on port ${session.port}. Press Ctrl+C to stop it.\n`,
  );
  await new Promise<void>((resolve) => {
    process.once("SIGINT", resolve);
    process.once("SIGTERM", resolve);
  });
  process.stdout.write("Stopping Wrangler…\n");
  await session.stop();
  return 0;
}

export async function runWorkflows(argv: readonly string[]): Promise<number> {
  const [sub, ...rest] = argv;
  if (sub === "list") return runWorkflowsList(rest);
  if (sub === "run") return runWorkflowsRun(rest);
  if (sub === "serve") return runWorkflowsServe(rest);
  process.stderr.write(
    `devtools workflows: unknown subcommand "${sub ?? "(none)"}". Expected: list, run or serve.\n`,
  );
  return 1;
}
