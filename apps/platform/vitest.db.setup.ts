import { sql } from "drizzle-orm";
import { beforeAll } from "vitest";
import { db } from "~/server/db";
import { env } from "~/env";

/**
 * Clears the rate-limit ledger before each db-test file.
 *
 * The team actions consume real `platform."rateLimitHits"` budget
 * (`server/rateLimit.ts`), and the test files reuse fixed user UUIDs, so a
 * few `pnpm test:db` runs inside one 10-minute window exhaust those users'
 * budgets and later runs fail with rate-limit errors unrelated to what they
 * test. Refuses to touch anything but a local database.
 */
beforeAll(async () => {
  const { hostname } = new URL(env.DB_URL);
  if (hostname !== "127.0.0.1" && hostname !== "localhost") {
    throw new Error(
      `db tests must run against a local database, not ${hostname}.`,
    );
  }
  await db.execute(sql`delete from platform."rateLimitHits"`);
});
