import type { SearchEntry } from "./types";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Matches `entries` against `query`. An entry qualifies only if every
 * whitespace-separated token in `query` appears (case-insensitively) in the
 * title, description, or a breadcrumb. Results are scored per-token (title
 * exact > title starts-with > title contains > breadcrumb contains >
 * description contains) and sorted descending.
 */
export function matchEntries(
  entries: SearchEntry[],
  query: string,
  limit = 20,
): SearchEntry[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const tokens = trimmed.toLowerCase().split(/\s+/);

  const scored: { entry: SearchEntry; score: number }[] = [];

  for (const entry of entries) {
    const title = entry.title.toLowerCase();
    const description = entry.description?.toLowerCase() ?? "";
    const breadcrumbs = entry.breadcrumbs.map((b) => b.toLowerCase());

    let score = 0;
    let qualifies = true;

    for (const token of tokens) {
      let tokenScore = 0;
      if (title === token) tokenScore = 100;
      else if (title.startsWith(token)) tokenScore = 50;
      else if (title.includes(token)) tokenScore = 25;
      else if (breadcrumbs.some((b) => b.includes(token))) tokenScore = 10;
      else if (description.includes(token)) tokenScore = 5;

      if (tokenScore === 0) {
        qualifies = false;
        break;
      }
      score += tokenScore;
    }

    if (qualifies) scored.push({ entry, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.entry);
}

/** Wraps query token matches in `text` with `<mark>`, escaping HTML first. */
export function highlightMatches(text: string, query: string): string {
  const escaped = escapeHtml(text);

  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return escaped;

  const pattern = new RegExp(`(${tokens.map(escapeRegExp).join("|")})`, "gi");
  return escaped.replace(pattern, "<mark>$1</mark>");
}
