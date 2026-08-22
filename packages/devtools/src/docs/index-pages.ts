/**
 * `devtools docs index` — the documentation search index.
 *
 * ## Why it lives here
 *
 * It was `apps/platform/scripts/index-docs.ts`, and it was the last script in
 * the repository run from more than one place: `pnpm docs:index` by a
 * contributor, and `pnpm docs:index --force` by BOTH deploy scripts, ahead of
 * every staging and production release. A step the deploy depends on is not an
 * app's private tooling, and the rest of that class — `deploy write-env`,
 * `secrets-file`, `orphans`, `preflight`, `mint-token`, `require-token` —
 * moved into this package already, for the reasons `cli.ts` gives.
 *
 * The three that stayed behind in `apps/platform/scripts/` each have exactly
 * one caller and are about the platform's own generated sources:
 * `post-pull.ts` patches what `drizzle-kit pull` emits, `generate-campus-map.ts`
 * is hand-run codegen, and `seed-builtin-roles.ts` seeds rows through the
 * platform's own Drizzle schema. Reuse is the line, not subject matter.
 *
 * ## Why raw SQL rather than Drizzle
 *
 * The predecessor imported `~/server/db` and `~/server/db/schema`, which is a
 * package reaching into an app — the wrong direction, and it would have
 * dragged the platform's whole generated schema into a CLI that installs on a
 * fresh clone. Four columns of one table do not need an ORM, and this package
 * already talks to Postgres exactly this way (see `planner/db.ts`).
 *
 * `search` is a generated column, so this writes title/description/plainText
 * and Postgres recomputes the vector.
 */
import { confirm, log, spinner } from "@clack/prompts";
import postgres from "postgres";
import { bail, errorMessage, explain, unwrap } from "../ui.js";

/** One row of the artifact `@devdogsuga/docs` builds. */
export interface DocsPage {
  path: string;
  title: string;
  description: string | null;
  plainText: string;
}

/**
 * The seam, kept as narrow as `planner/db.ts`'s.
 *
 * Parameterised rather than that module's `run(text)`: page content is the one
 * thing here that is not a constant, and it is markdown — apostrophes,
 * dollar-quoting, whatever a contributor writes. Nothing is interpolated.
 */
export interface DocsDb {
  run(query: string, params: readonly unknown[]): Promise<unknown[]>;
  end(): Promise<void>;
}

export type Connect = (url: string) => DocsDb;

export function connectDocsDb(url: string): DocsDb {
  // `max: 1` is load-bearing, not tuning: the write below is BEGIN, two
  // statements and COMMIT, and they have to land on the same session.
  const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 15 });
  return {
    async run(query, params) {
      return (await sql.unsafe(query, params as never[])) as unknown[];
    },
    async end() {
      await sql.end({ timeout: 5 });
    },
  };
}

// ── Which database ───────────────────────────────────────────────────────────

const LOCAL_DB_HOSTS = [
  "localhost",
  "127.0.0.1",
  "[::1]",
  "host.docker.internal",
];

export function isLocalDatabase(url: string): boolean {
  try {
    return LOCAL_DB_HOSTS.includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

// ── The write ────────────────────────────────────────────────────────────────

/**
 * Upsert every page by path, then delete the rows whose path is gone.
 *
 * One transaction, and the delete is the reason `--force` exists: run against
 * a deployed database from a working copy, this replaces the live index with
 * whatever happens to be checked out.
 */
export async function indexPages(
  db: DocsDb,
  pages: readonly DocsPage[],
): Promise<number> {
  const values = pages
    .map(
      (_, i) => `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4})`,
    )
    .join(", ");

  const params = pages.flatMap((page) => [
    page.path,
    page.title,
    page.description,
    page.plainText,
  ]);

  await db.run("begin", []);
  try {
    await db.run(
      `insert into platform."docsPages" (path, title, description, "plainText")
       values ${values}
       on conflict (path) do update set
         title = excluded.title,
         description = excluded.description,
         "plainText" = excluded."plainText",
         "updatedAt" = now()`,
      params,
    );

    await db.run(
      `delete from platform."docsPages" where path <> all($1::text[])`,
      [pages.map((page) => page.path)],
    );

    await db.run("commit", []);
  } catch (err) {
    await db.run("rollback", []);
    throw err;
  }

  return pages.length;
}

// ── The command ──────────────────────────────────────────────────────────────

/**
 * Loads the built artifact.
 *
 * Imported dynamically so that `@devdogsuga/docs` is only needed by the one
 * command that reads it. Every other command in this CLI — `setup` most of
 * all, which runs on a clone where nothing is built yet — must not pay for a
 * docs build to start.
 */
async function loadPages(): Promise<readonly DocsPage[]> {
  const { pages } = (await import("@devdogsuga/docs")) as {
    pages: readonly DocsPage[];
  };
  return pages;
}

export interface DocsIndexOptions {
  force?: boolean;
  connect?: Connect;
  load?: () => Promise<readonly DocsPage[]>;
}

export async function runDocsIndex(
  options: DocsIndexOptions = {},
): Promise<void> {
  const connect = options.connect ?? connectDocsDb;
  const load = options.load ?? loadPages;

  const url = process.env.DB_URL;
  if (!url) {
    explain("DB_URL is not set.", "", [
      "Run through `pnpm devtools`, which loads your .env.",
      "`pnpm devtools link` starts the local stack and writes one.",
    ]);
    process.exitCode = 1;
    return;
  }

  let pages: readonly DocsPage[];
  try {
    pages = await load();
  } catch (err) {
    explain("The docs artifact could not be read.", errorMessage(err), [
      "pnpm --filter @devdogsuga/docs build",
    ]);
    process.exitCode = 1;
    return;
  }

  if (pages.length === 0) {
    explain("The docs artifact is empty.", "", [
      "pnpm --filter @devdogsuga/docs build",
    ]);
    process.exitCode = 1;
    return;
  }

  // Non-local is opt-in because of the delete. `--force` is how the deploy
  // scripts say yes; a person gets asked, which the predecessor could not do
  // from a `process.argv` check in a bare script.
  if (!isLocalDatabase(url)) {
    if (!options.force) {
      if (!process.stdin.isTTY) {
        explain(
          "That is not a local database, and --force was not given.",
          "",
          [
            "It deletes the rows for pages that no longer exist, so this would",
            "replace the live search index with your working copy.",
          ],
        );
        process.exitCode = 1;
        return;
      }
      const go = unwrap(
        await confirm({
          message:
            "DB_URL is NOT local. Replace that database's search index with " +
            "this working copy?",
          initialValue: false,
        }),
      );
      if (!go) bail("Left the index alone.");
    } else {
      log.warn("Indexing a non-local database, as --force asked.");
    }
  }

  const s = spinner();
  s.start(`Indexing ${pages.length} page(s)`);

  const db = connect(url);
  try {
    const count = await indexPages(db, pages);
    s.stop(`Indexed ${count} page(s)`);
  } catch (err) {
    s.stop("The index was not written");
    explain("Writing the docs index failed.", errorMessage(err), [
      "`pnpm devtools push` applies any migration the table is missing.",
    ]);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}
