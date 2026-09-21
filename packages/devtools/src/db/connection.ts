/**
 * Resolves the database a `db` command acts on — from the SESSION, never
 * from a flag.
 *
 * There used to be two connection mechanisms here (`db/remote.ts`'s
 * `--target remote` tier resolver, and `db/local-env.ts`'s "whatever this
 * process entered"), joined by a `--target local|remote` flag that asked a
 * question the launcher had already answered: `launch.ts` settles a session
 * (`--tier development:local|development:remote|staging|production`, or the
 * picker) and enters its env BEFORE any command dispatches, so
 * `process.env.DB_URL` already names the one database this session means.
 * This module reads that — the same `DB_URL` every app and script uses —
 * and every mechanism-one caller now goes through it. `resolveLocalToolingEnv`
 * remains for the two commands that hand a whole ENVIRONMENT to a child
 * process rather than needing a connection of their own.
 *
 * What it adds over a raw `process.env.DB_URL` read is the two sanity
 * guards a session can still violate:
 *
 *   * development meaning the LOCAL stack, but `DB_URL` pointing somewhere
 *     that is not loopback — the stack went down after launch (the overlay
 *     is applied at entry; see `load.ts`'s probe table) or the degraded
 *     `db`-exempt entry ran without it. Refused with `db start`
 *     troubleshooting rather than letting `.env`'s hosted `DB_URL` answer
 *     for a command that asked for Docker.
 *   * a DEPLOYED tier whose `DB_URL` points AT loopback — the signature of
 *     inherited development values winning under `override: false` (see
 *     `launch.ts`). Refused rather than "migrating staging" against a local
 *     container.
 *
 * Reports the reason on stderr and returns `null` on every failure path —
 * never throws for an expected failure — so a caller can stop without
 * printing a second explanation of its own.
 *
 * ## `db connect` — plausibly vestigial
 *
 * `connectRemoteProject` (`stack.ts`) still runs `supabase link
 * --project-ref <ref>`, the pre-session way of naming "the remote project",
 * remembered by the supabase CLI on disk and read by nothing in this CLI:
 * every operation here passes `--db-url`/`--project-ref` explicitly. It may
 * still matter to someone driving the bare `supabase` CLI by hand, so
 * removing it is a separate decision from this refactor.
 */
import {
  DEPLOY_ENVIRONMENTS,
  fileFor,
  isDeployEnvironment,
} from "@devdogsuga/env";
import type { DeployEnvironment } from "@devdogsuga/env";
import { DEV_DB_ENV, isDevDatabase } from "@devdogsuga/env/load";
import type { DevDatabase } from "@devdogsuga/env/load";

/**
 * Hostnames that mean "the Docker stack on this machine". The same list
 * `docs/index-pages.ts` keeps for its delete-acknowledgment; duplicated
 * because that module answers a different question ("may I delete rows
 * here without --target remote?") and coupling the two would let a change
 * for one silently reshape the other.
 */
const LOCAL_DB_HOSTS = [
  "localhost",
  "127.0.0.1",
  "[::1]",
  "host.docker.internal",
];

export function isLocalDbUrl(url: string): boolean {
  try {
    return LOCAL_DB_HOSTS.includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** The hostname for messages — never the URL itself, which carries the
 * password. */
export function dbHost(url: string): string {
  try {
    return new URL(url).hostname || "unknown host";
  } catch {
    return "unknown host";
  }
}

/** What the session resolved to: the one database every `db` data command
 * in this process acts on. `projectRef` is only validated where it is
 * actually needed (`seed buckets`, `config push`). */
export interface DbConnection {
  tier: DeployEnvironment;
  /** The session's development qualifier, when one was entered. */
  devDatabase: DevDatabase | undefined;
  dbUrl: string;
  projectRef: string | undefined;
}

/** Whether this connection is the Docker stack on this machine — the one
 * database whose erasure is routine rather than gated sternly. */
export function isLocalConnection(conn: DbConnection): boolean {
  return conn.tier === "development" && isLocalDbUrl(conn.dbUrl);
}

/**
 * How gates and reports name the target. Deliberately tier-and-host only —
 * never the DB_URL, which carries the password — and "remote development"
 * is spelled out because `staging`/`production` are also remote: the whole
 * reason the session vocabulary qualifies development.
 */
export function describeDbTarget(conn: DbConnection): string {
  if (conn.tier !== "development") return `the ${conn.tier} database`;
  if (isLocalDbUrl(conn.dbUrl)) return "your local database";
  return `the remote development database at ${dbHost(conn.dbUrl)}`;
}

export interface ResolveDbConnectionOptions {
  /** Stderr prefix, e.g. "devtools db reset". */
  label?: string;
  /** Injectable for tests; defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
  /** Suppress the stderr reason — for callers like `db status` that treat
   * "no resolvable database" as an answer, not a failure. */
  quiet?: boolean;
}

export function resolveDbConnection(
  opts: ResolveDbConnectionOptions = {},
): DbConnection | null {
  const env = opts.env ?? process.env;
  const label = opts.label ?? "devtools db";
  const report = (message: string): void => {
    if (!opts.quiet) process.stderr.write(message);
  };

  const rawTier = env.DEPLOY_ENV;
  let tier: DeployEnvironment;
  if (rawTier === undefined || rawTier === "") {
    tier = "development";
  } else if (isDeployEnvironment(rawTier)) {
    tier = rawTier;
  } else {
    report(
      `${label}: DEPLOY_ENV="${rawTier}" is not one of ${DEPLOY_ENVIRONMENTS.join(", ")}.\n`,
    );
    return null;
  }

  let devDatabase: DevDatabase | undefined;
  const rawDevDb = env[DEV_DB_ENV];
  if (tier === "development" && rawDevDb !== undefined && rawDevDb !== "") {
    if (!isDevDatabase(rawDevDb)) {
      report(
        `${label}: ${DEV_DB_ENV}="${rawDevDb}" is not one of: local, remote.\n`,
      );
      return null;
    }
    devDatabase = rawDevDb;
  }

  const dbUrl = env.DB_URL;
  if (dbUrl === undefined || dbUrl === "") {
    if (tier !== "development") {
      report(`${label}: ${fileFor(tier)} has no DB_URL.\n`);
    } else if (devDatabase === "remote") {
      report(
        `${label}: this session targets the remote development database, but .env has no DB_URL.\n`,
      );
    } else {
      report(
        `${label}: no DB_URL in this session — the local Supabase stack is ` +
          "not running. Run `pnpm devtools db start`, or relaunch with " +
          "`--tier development:remote` (or staging/production) to act on a " +
          "hosted database.\n",
      );
    }
    return null;
  }

  if (
    tier === "development" &&
    devDatabase !== "remote" &&
    !isLocalDbUrl(dbUrl)
  ) {
    report(
      `${label}: DB_URL points at ${dbHost(dbUrl)}, not the local stack — ` +
        "it is offline (or .env.generated is stale). Run `pnpm devtools db " +
        "start`, or relaunch with `--tier development:remote` if you mean " +
        "that database.\n",
    );
    return null;
  }

  if (tier !== "development" && isLocalDbUrl(dbUrl)) {
    report(
      `${label}: the session tier is ${tier} but DB_URL points at ` +
        `${dbHost(dbUrl)} — a local address, the signature of inherited ` +
        "development values. Relaunch with `pnpm devtools --tier " +
        `${tier}\` from a clean shell.\n`,
    );
    return null;
  }

  return { tier, devDatabase, dbUrl, projectRef: env.PROJECT_REF };
}
