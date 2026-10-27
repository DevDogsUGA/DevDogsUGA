/**
 * Production access for the commands that read or write member data
 * (`involvement`, `attendance`, `export`).
 *
 * Every key comes from one place, so a run never splits across two projects:
 * the checkout's `.env.production`, else the production Secrets Manager
 * project. There is deliberately no `--db-url`; a database override would
 * leave account creation (which goes through Auth with `API_URL`) pointed at
 * production.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { nonEmpty } from "@devdogsuga/cli-core/db/connection";
import { EnvDocument } from "@devdogsuga/cli-core/env/document";
import { discoverRepoRoot } from "@devdogsuga/cli-core/repo/root";
import postgres from "postgres";

/** A failure already worded for the officer. Safe to print. */
export class ProductionError extends Error {
  override name = "ProductionError";
}

export type ProductionKey =
  "DB_URL" | "API_URL" | "SECRET_KEY" | "GH_APP_ID" | "GH_APP_PRIVATE_KEY";

/** The production project in Secrets Manager (see `creds/roster.ts`). */
const PRODUCTION_PROJECT = "production";

/** `.env.production` in a checkout, else the production Secrets Manager project. */
export async function readProductionKey(
  key: ProductionKey,
): Promise<string | undefined> {
  const root = discoverRepoRoot();
  if (root) {
    try {
      const text = await readFile(resolve(root, ".env.production"), "utf8");
      const value = nonEmpty(EnvDocument.parse(text).get(key));
      if (value) return value;
    } catch {
      // No .env.production here; Secrets Manager next.
    }
  }
  const { listSecrets, projectIdFor } = await import("../bws/client.js");
  const secrets = await listSecrets(await projectIdFor(PRODUCTION_PROJECT));
  return nonEmpty(secrets.find((s) => s.key === key)?.value);
}

export async function requireProductionKey(
  key: ProductionKey,
): Promise<string> {
  const value = await readProductionKey(key);
  if (!value) {
    throw new ProductionError(
      `Could not find production's ${key}. Run \`backstage env pull --target production\` ` +
        "in a checkout, or sign in to Secrets Manager.",
    );
  }
  return value;
}

/**
 * A database failure, described without the connection string: postgres.js
 * can quote the host, and the URL carries the password. A server error
 * (a five-character SQLSTATE) is the server's own message, which never does.
 */
export function dbError(what: string, err: unknown): ProductionError {
  const e = err as { code?: string; message?: string };
  const detail = e.code && /^[0-9A-Z]{5}$/.test(e.code) ? e.message : e.code;
  return new ProductionError(`${what}: ${detail ?? "connection failed"}.`);
}

/** One short-lived connection; callers `end()` it. */
export function connect(url: string) {
  return postgres(url, { max: 1, prepare: false, connect_timeout: 15 });
}

export type Sql = ReturnType<typeof connect>;

/** Runs `fn` on a fresh connection and closes it, rewording failures. */
export async function withConnection<T>(
  url: string,
  what: string,
  fn: (sql: Sql) => Promise<T>,
): Promise<T> {
  const sql = connect(url);
  try {
    return await fn(sql);
  } catch (err) {
    if (err instanceof ProductionError) throw err;
    throw dbError(what, err);
  } finally {
    await sql.end({ timeout: 5 });
  }
}
