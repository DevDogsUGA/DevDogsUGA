/**
 * Database commands, over the session's database.
 *
 * Previously delegated to `@devdogsuga/supabase` package scripts by name,
 * then to a `--target local|remote` flag; now every data command acts on the
 * ONE database the session entered (see `db/connection.ts`), passed to the
 * supabase CLI as an explicit `--db-url`. That uniformity is load-bearing:
 * the CLI's own defaults disagree per subcommand (`db push` defaults to the
 * LINKED project, `db reset` to `--local`), and `--db-url` is the one
 * spelling that can neither fall back to `supabase link`'s ambient state
 * nor quietly pick a different database than the session says.
 *
 * The stack-lifecycle commands (`start`/`stop`/`restart`) are the deliberate
 * exception: they act on this machine's Docker containers, which no DB_URL
 * names, and they run under any session — starting your local stack while
 * the session targets staging is odd but harmless, and refusing it would
 * block the one command that fixes an offline-local session.
 */
import { rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  describeEnvironment,
  probeEnvironment,
  PROJECT_ROOT,
} from "./environment.js";
import {
  dbPush,
  generateTypes,
  seedBuckets,
  supabase,
  supabaseCapture,
} from "./db/run.js";
import {
  describeDbTarget,
  isLocalConnection,
  type DbConnection,
} from "./db/connection.js";
import { refreshSessionEnv } from "./db/session-refresh.js";
import { originReachable, resolveBaseUrl } from "./cron/commands.js";

// Scope order, matching `db`'s subcommands in `commands.ts`: the four that
// act on the Supabase stack (`connect` is handled separately below — it
// takes a positional ref), then the two that write the Postgres database
// inside the session's endpoint.
export const STACK_COMMANDS = [
  "start",
  "stop",
  "restart",
  "status",
  "migrate",
  "reset",
] as const;
export type StackCommand = (typeof STACK_COMMANDS)[number];

// ── Implementations ──────────────────────────────────────────────────────────

async function startLocalStack(): Promise<number> {
  const code = await supabase("start");
  if (code !== 0) return code;
  // Write the local stack's connection details so with-env can load them.
  let env: string;
  try {
    env = await supabaseCapture("status", "-o", "env");
  } catch {
    return 1;
  }
  await writeFile(join(PROJECT_ROOT, ".env.generated"), env);
  return seedBuckets({ kind: "local" });
}

async function stopLocalStack(): Promise<number> {
  const code = await supabase("stop");
  if (code !== 0) return code;
  rmSync(join(PROJECT_ROOT, ".env.generated"), { force: true });
  return 0;
}

/**
 * `db connect [<project-ref>]` — run `supabase link` for whoever drives the
 * bare supabase CLI by hand. Nothing in devtools reads what it writes any
 * more (see `db/connection.ts`'s header); it survives as a convenience, not
 * a dependency.
 */
export async function connectRemoteProject(ref?: string): Promise<number> {
  const projectRef = ref ?? process.env.PROJECT_REF;
  if (!projectRef) {
    process.stderr.write(
      "devtools db connect: no project ref given, and PROJECT_REF is not set. " +
        "Pass one, or add PROJECT_REF to your .env file.\n",
    );
    return 1;
  }
  return supabase("link", "--project-ref", projectRef);
}

/** The `seed buckets` shape this connection implies — `--db-url` does not
 * exist for that subcommand, so it is the one data command still keyed on
 * local-vs-hosted rather than on the URL itself. */
function bucketsShape(
  connection: DbConnection,
): Parameters<typeof seedBuckets>[0] {
  return isLocalConnection(connection)
    ? { kind: "local" }
    : { kind: "remote", projectRef: connection.projectRef };
}

async function pushMigrations(connection: DbConnection): Promise<number> {
  // The bare push (shared with CI's `deploy migrate`) then the type
  // regeneration the contributor path layers on top — see `dbPush`'s header
  // for why the two are split.
  const code = await dbPush(connection.dbUrl);
  if (code !== 0) return code;
  return generateTypes(connection.dbUrl);
}

/**
 * ⚠️ SAFETY-CRITICAL: drops and re-migrates `connection.dbUrl`. The caller
 * (`cli.ts`'s `runStack`) has already confirmed the session target —
 * including the hard production gate — before this ever runs.
 *
 * Meetings and workshops are NOT among the tables `supabase/seed/*.sql`
 * populates -- they come from `@devdogsuga/events` via
 * `reconcileFromConfig`, an authenticated platform route rather than a
 * devtools-side function this CLI can call directly (it needs the app's
 * Drizzle client, relations and Sentry wiring, none of which belong in this
 * package). On a local reset this calls that route itself, over the same
 * origin `cron run` would use, once the reset and rebuild finish -- see
 * `reconcileConfigAfterReset` for what happens when nothing is listening yet.
 */
async function reset(connection: DbConnection): Promise<{
  code: number;
  lines: string[];
}> {
  const code = await supabase("db", "reset", "--db-url", connection.dbUrl);
  if (code !== 0) return { code, lines: [] };
  const types = await generateTypes(connection.dbUrl);
  if (types !== 0) return { code: types, lines: [] };
  const bucketsCode = await seedBuckets(bucketsShape(connection));
  if (bucketsCode !== 0) return { code: bucketsCode, lines: [] };
  return {
    code: 0,
    lines: isLocalConnection(connection)
      ? await reconcileConfigAfterReset()
      : [],
  };
}

/** Injectable so a test can fake "server up" / "server down" and inspect the
 * request `reconcileConfigAfterReset` sends, without a real dev server or a
 * `vi.stubGlobal` on `fetch`. Defaults to the real network. */
export interface ReconcileConfigDeps {
  reachable: typeof originReachable;
  fetch: typeof globalThis.fetch;
}

/**
 * Best-effort trigger for `GET /cron/config-reconcile` against the local
 * platform dev server, so `db reset` leaves meetings and workshops seeded
 * whenever that server happens to already be up -- the common case for a
 * repeat reset during development, rather than a first clone. No
 * `CRON_SECRET` is sent because the route itself skips auth outside a
 * deployed `DEPLOY_ENV` (see that route's header); this is exactly the
 * unauthenticated local request `cron run` would send.
 *
 * When nothing answers yet -- most likely a first-time reset, before anyone
 * has run `pnpm --filter platform dev` -- this reports that instead of
 * silently leaving the tables empty, and names the manual step: start the
 * server, then either re-run this reset or fire the shared fifteen-minute
 * cron slot directly with `pnpm devtools cron run`.
 */
export async function reconcileConfigAfterReset(
  deps: ReconcileConfigDeps = {
    reachable: originReachable,
    fetch: globalThis.fetch,
  },
): Promise<string[]> {
  const { reachable, fetch: fetchImpl } = deps;
  const baseUrl = resolveBaseUrl("platform", "development", undefined, {});
  const manualStep =
    "Start the platform app (`pnpm --filter platform dev`) and either " +
    "re-run `pnpm devtools db reset` or run `pnpm devtools cron run --app " +
    "platform --cron '*/15 * * * *' --yes`.";

  if (!(await reachable(baseUrl))) {
    return [
      `Meetings and workshops are not seeded yet -- nothing is listening at ${baseUrl} ` +
        `to reconcile @devdogsuga/events into them. ${manualStep}`,
    ];
  }

  const url = new URL("/cron/config-reconcile", baseUrl).toString();
  let response: Response;
  try {
    response = await fetchImpl(url);
  } catch (err) {
    return [
      `Config reconcile request to ${url} failed: ` +
        `${err instanceof Error ? err.message : String(err)}. ${manualStep}`,
    ];
  }

  if (!response.ok) {
    return [
      `Config reconcile answered HTTP ${response.status} at ${url}. ${manualStep}`,
    ];
  }

  const body = (await response.json()) as
    { success: true; counts: unknown } | { success: false; reason: string };
  if (!body.success) {
    return [
      `Config reconcile ran but was aborted (${body.reason}) -- meetings and ` +
        "workshops are still empty. Check the platform dev server's console.",
    ];
  }

  return ["Meetings and workshops reconciled from @devdogsuga/events."];
}

/**
 * BUG 2's fix, applied at every point `start`/`stop`/`restart` can change
 * `.env.generated`: on success, refresh this process's entered environment
 * (see `db/session-refresh.ts`) so the rest of the session — including a
 * `db introspect` run right after this one — sees the stack's CURRENT
 * connection, not whatever `process.env` held at launch. A failed stack
 * command changed nothing on disk, so there is nothing to refresh.
 */
async function afterLocalStackChange(code: number): Promise<string[]> {
  if (code !== 0) return [];
  return refreshSessionEnv();
}

// ── The local stack's lifecycle ──────────────────────────────────────────────

/**
 * Stop, then start again.
 *
 * Two steps rather than one, because `supabase restart` does not exist. The
 * CLI's own answer to a changed `config.toml` is a stop/start pair. Doing it
 * here turns that into one menu entry, rather than two commands the contributor
 * has to know to run in that order.
 *
 * A failed stop short-circuits. Starting a stack that never went down would
 * report success and leave the config change unapplied, which is the one
 * outcome worse than a visible failure.
 */
async function restartLocal(): Promise<{ code: number; lines: string[] }> {
  const stopCode = await stopLocalStack();
  if (stopCode !== 0) {
    return {
      code: stopCode,
      lines: [
        "Stopping failed, so nothing was restarted. " +
          "Scroll up for the output from the Supabase CLI.",
      ],
    };
  }
  const code = await startLocalStack();
  return { code, lines: await afterLocalStackChange(code) };
}

/**
 * What `status` says for a local session, now that it can answer for itself.
 *
 * `environment.ts` already reads the two facts that question is really asking
 * about, so this reports them and names the next step.
 */
function localStatus(): { code: number; lines: string[] } {
  const env = probeEnvironment();

  let next: string;
  if (env.docker === "no") {
    next = "Start Docker, then `pnpm devtools db start` to bring the stack up.";
  } else if (env.stack === "yes") {
    next = "The stack is up. `supabase status` prints its URLs and keys.";
  } else if (env.stack === "no") {
    next = "Nothing is running. `pnpm devtools db start` starts it.";
  } else {
    next = "Could not read Docker. `supabase status` asks the stack directly.";
  }

  return { code: 0, lines: [describeEnvironment(env), next] };
}

/**
 * Runs a stack command, returning its exit code and anything to report.
 *
 * `connection` is present exactly when the command writes the database
 * (`migrate`, `reset`) — the caller (`cli.ts`'s `runStack`) resolves it,
 * because resolving means possibly refusing with a printed reason, and the
 * lifecycle commands must keep working with no resolvable database at all
 * (that is what `db start` is FOR). `status` receives whatever resolved,
 * or `null`, and degrades to machine facts.
 */
export async function runStackCommand(
  command: StackCommand,
  connection: DbConnection | null,
): Promise<{ code: number; lines: string[] }> {
  if (command === "restart") return restartLocal();

  if (command === "stop") {
    const code = await stopLocalStack();
    return { code, lines: await afterLocalStackChange(code) };
  }

  if (command === "start") {
    const code = await startLocalStack();
    return { code, lines: await afterLocalStackChange(code) };
  }

  if (command === "status") {
    if (connection === null || isLocalConnection(connection)) {
      return localStatus();
    }
    return {
      code: 0,
      lines: [
        `This session targets ${describeDbTarget(connection)}` +
          (connection.projectRef
            ? ` (project ${connection.projectRef}).`
            : ".") +
          " Check the Supabase dashboard for its health.",
      ],
    };
  }

  if (connection === null) {
    return {
      code: 1,
      lines: [`No database connection was resolved for \`${command}\`.`],
    };
  }

  if (command === "migrate") {
    return { code: await pushMigrations(connection), lines: [] };
  }

  return reset(connection);
}
