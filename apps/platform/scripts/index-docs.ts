import "./loadEnv";

import { notInArray, sql } from "drizzle-orm";
import { pages } from "@devdogsuga/docs";
import { db } from "~/server/db";
import { docsPages } from "~/server/db/schema";
import { env } from "~/env";

/**
 * Pushes the build-time docs artifact into the `docsPages` search index.
 *
 * Pages themselves are served from the bundled artifact; Postgres only holds
 * what full-text search reads. The `search` tsvector is a generated column, so
 * this writes title/description/plainText and Postgres recomputes the rest.
 *
 *   pnpm docs:index          # local Supabase
 *   pnpm docs:index --force  # any other database (deploys)
 */

const LOCAL_DB_HOSTS = ["localhost", "127.0.0.1", "[::1]", "host.docker.internal"];

function isLocalDatabase(url: string): boolean {
  try {
    return LOCAL_DB_HOSTS.includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

async function main() {
  const force = process.argv.includes("--force");

  // This script deletes rows for paths that no longer exist. Running it against
  // the deployed database from a working copy would replace the live docs index
  // with whatever is checked out locally, so non-local targets are opt-in.
  if (!isLocalDatabase(env.DB_URL) && !force) {
    console.error(
      "[docs:index] refusing to write to a non-local database without --force.\n" +
        "             This replaces the live search index with your working copy.",
    );
    process.exit(1);
  }

  if (pages.length === 0) {
    console.error(
      "[docs:index] the docs artifact is empty — run `pnpm --filter @devdogsuga/docs build` first.",
    );
    process.exit(1);
  }

  const rows = pages.map((page) => ({
    path: page.path,
    title: page.title,
    description: page.description,
    plainText: page.plainText,
  }));

  await db.transaction(async (tx) => {
    await tx
      .insert(docsPages)
      .values(rows)
      .onConflictDoUpdate({
        target: docsPages.path,
        set: {
          title: sql`excluded."title"`,
          description: sql`excluded."description"`,
          plainText: sql`excluded."plainText"`,
          updatedAt: sql`now()`,
        },
      });

    await tx.delete(docsPages).where(
      notInArray(
        docsPages.path,
        rows.map((row) => row.path),
      ),
    );
  });

  console.log(`[docs:index] indexed ${rows.length} page(s)`);
}

await main();
process.exit(0);
