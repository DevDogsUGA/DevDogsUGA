import { docsHref, splitProjectPath } from "~/lib/docsSlug";
import { toTitleCase } from "~/lib/toTitleCase";
import {
  getPublishedPointers,
  getPublishedSearchEntries,
} from "~/server/docs/published";
import type { PublishedSearchEntry } from "~/server/docs/published/schema";
import { escapeHtml } from "./match";
import type { SearchEntry } from "./types";

/**
 * Search over the projects published through the docs pipeline.
 *
 * The built-in docs are searched in Postgres (`searchDocs`), an index rebuilt
 * on each deploy. A published project's pages arrive between deploys, so its
 * `search.json` is read from the bucket instead and matched here, in memory:
 * nothing is written to the database index, and `populate:search` stays the
 * only thing that writes it. Entries are shaped exactly like `searchDocs`'
 * (group "docs", a snippet with `<mark>`) and carry the project's name in
 * their breadcrumbs so a result says where it came from.
 */

const SNIPPET_LENGTH = 160;

const tokensOf = (query: string) =>
  query.trim().toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);

function score(entry: PublishedSearchEntry, tokens: string[]): number {
  const title = entry.title.toLowerCase();
  const description = (entry.description ?? "").toLowerCase();
  const text = entry.plainText.toLowerCase();
  let total = 0;
  for (const token of tokens) {
    let points = 0;
    if (title === token) points = 100;
    else if (title.startsWith(token)) points = 50;
    else if (title.includes(token)) points = 25;
    else if (description.includes(token)) points = 10;
    else if (text.includes(token)) points = 5;
    if (points === 0) return 0;
    total += points;
  }
  return total;
}

/** A window of the page's text around the first match, escaped, with matches wrapped in <mark>. */
export function snippetHtml(plainText: string, tokens: string[]): string {
  const flat = plainText.replace(/\s+/g, " ").trim();
  const lower = flat.toLowerCase();
  let at = -1;
  for (const token of tokens) {
    const found = lower.indexOf(token);
    if (found !== -1 && (at === -1 || found < at)) at = found;
  }
  const start = Math.max(0, at === -1 ? 0 : at - 40);
  const window = flat.slice(start, start + SNIPPET_LENGTH);
  const pattern = new RegExp(
    `(${tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
    "gi",
  );
  // Escape each piece on its own so a match can never split an entity.
  const html = window
    .split(pattern)
    .map((piece, i) =>
      i % 2 === 1 ? `<mark>${escapeHtml(piece)}</mark>` : escapeHtml(piece),
    )
    .join("");
  return `${start > 0 ? "… " : ""}${html}${start + SNIPPET_LENGTH < flat.length ? " …" : ""}`;
}

export async function searchPublishedDocs(
  query: string,
  options: { limit: number },
): Promise<SearchEntry[]> {
  const tokens = tokensOf(query);
  if (tokens.length === 0) return [];

  const pointers = await getPublishedPointers();
  const scored: { entry: SearchEntry; score: number }[] = [];
  await Promise.all(
    pointers.map(async (pointer) => {
      const entries = await getPublishedSearchEntries(pointer);
      for (const entry of entries) {
        const points = score(entry, tokens);
        if (points === 0) continue;
        const { project, path } = splitProjectPath(entry.path);
        if (project !== pointer.project) continue;
        const segments = path === "" ? [] : path.split("/");
        scored.push({
          score: points,
          entry: {
            id: `docs:${pointer.project}:${entry.path}`,
            title: entry.title,
            description: entry.description ?? undefined,
            url: docsHref(pointer.project, segments),
            icon: "BookOpenIcon",
            breadcrumbs: [
              "Contribute",
              toTitleCase(pointer.project),
              ...segments.slice(0, -1).map(toTitleCase),
            ],
            group: "docs",
            snippet: snippetHtml(entry.plainText, tokens),
          },
        });
      }
    }),
  );
  return scored
    .sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id))
    .slice(0, options.limit)
    .map((s) => s.entry);
}
