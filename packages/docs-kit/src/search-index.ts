/**
 * `docs-kit index`: writes the documentation search index.
 *
 * One call to `platform.replace_docs_index(pages)` (migration 41), which does
 * the whole write in a single transaction: upsert every page by path, delete
 * the rows whose path is gone, and skip all of it when a stored hash of the
 * pages already matches. This file only loads the compiled pages and makes
 * that call, through supabase-js and the `Database` types, so it works against
 * any tier the environment points at: `with-env` supplies `API_URL` and
 * `SECRET_KEY` (the service role, which the function is granted to and anon
 * is not).
 *
 * The pages come from the `dist/` that `docs-kit build` wrote, not from a
 * fresh compile, so what is indexed is exactly what the site renders.
 * `populate:search` therefore runs after `codegen`, never instead of it.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@devdogsuga/supabase";

/** The columns `replace_docs_index` reads from each element of `pages`. */
export type IndexedPage = {
  path: string;
  title: string;
  description: string | null;
  plainText: string;
  /** When the page goes live (UTC ISO); absent or null for a visible page. */
  publishAt?: string | null;
};

/** The slice of the Supabase client `indexPages` needs, so tests can fake it. */
export type IndexRpc = Pick<SupabaseClient<Database, "platform">, "rpc">;

/** The compiled pages, narrowed to what the index stores. */
export async function loadIndexedPages(
  contentRoot: string,
): Promise<IndexedPage[]> {
  const entry = path.join(contentRoot, "dist", "index.js");
  if (!fs.existsSync(entry)) {
    throw new Error(
      `${entry} does not exist. Run \`pnpm -F @devdogsuga/docs codegen\` first.`,
    );
  }

  const { pages } = (await import(pathToFileURL(entry).href)) as {
    pages: readonly IndexedPage[];
  };

  return pages.map((page) => ({
    path: page.path,
    title: page.title,
    description: page.description ?? null,
    plainText: page.plainText,
    publishAt: page.publishAt ?? null,
  }));
}

/** Resolves true when the index was rewritten, false when it already matched. */
export async function indexPages(
  client: IndexRpc,
  pages: IndexedPage[],
): Promise<boolean> {
  if (pages.length === 0) {
    throw new Error(
      "The docs build has no pages; refusing to empty the index.",
    );
  }

  const { data, error } = await client.rpc("replace_docs_index", { pages });
  if (error) throw new Error(error.message);
  return data === true;
}

/** The `index` subcommand. Sets the exit code instead of throwing. */
export async function runIndex(contentRoot: string): Promise<void> {
  const url = process.env["API_URL"];
  const key = process.env["SECRET_KEY"];
  if (!url || !key) {
    console.error(
      "[docs-kit] API_URL and SECRET_KEY are not set. Run through `with-env` (the `populate:search` script does); locally, start Supabase first.",
    );
    process.exitCode = 1;
    return;
  }

  try {
    const pages = await loadIndexedPages(contentRoot);
    const client = createClient<Database, "platform">(url, key, {
      db: { schema: "platform" },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const wrote = await indexPages(client, pages);
    console.log(
      wrote
        ? `[docs-kit] indexed ${pages.length} page(s)`
        : `[docs-kit] search index already matches ${pages.length} page(s), nothing written`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const cause =
      err instanceof Error && err.cause instanceof Error
        ? ` (${err.cause.message})`
        : "";
    console.error(
      `[docs-kit] could not write the search index: ${message}${cause}`,
    );
    process.exitCode = 1;
  }
}
