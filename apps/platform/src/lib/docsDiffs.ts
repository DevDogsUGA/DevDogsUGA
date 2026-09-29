/**
 * File diffs in a compiled docs page. `@devdogsuga/docs-compiler` turns a
 * top-level ```` ```diff file=… ```` block into an empty
 * `<div data-docs-diff="…">` whose attribute is `{ file, lang, patch }` as
 * base64 JSON (see the compiler's `diffs.ts`), plus both versions of the file
 * when the block held all of it (`context=`) and a GitHub link (`href=`). The page renders a diff viewer
 * in its place, so the HTML is split around each one; the compiler only emits
 * them between whole top-level elements, so every piece is balanced HTML.
 */

export interface DocsDiff {
  file: string;
  lang: string;
  patch: string;
  oldContent?: string;
  newContent?: string;
  href?: string;
}

const OPTIONAL = ["oldContent", "newContent", "href"] as const;

export type DocsHtmlPart =
  { kind: "html"; html: string } | ({ kind: "diff" } & DocsDiff);

const PLACEHOLDER = /<div data-docs-diff="([A-Za-z0-9+/=]+)"><\/div>/g;

function decode(base64: string): DocsDiff | null {
  try {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (
      value !== null &&
      typeof value === "object" &&
      typeof (value as DocsDiff).file === "string" &&
      typeof (value as DocsDiff).lang === "string" &&
      typeof (value as DocsDiff).patch === "string" &&
      OPTIONAL.every((key) =>
        ["string", "undefined"].includes(typeof (value as DocsDiff)[key]),
      )
    ) {
      return value as DocsDiff;
    }
  } catch {
    // Unreadable: left in the page as the empty div it is.
  }
  return null;
}

/** The page's HTML, cut into runs of HTML and the diffs between them. */
export function splitDocsDiffs(html: string): DocsHtmlPart[] {
  const parts: DocsHtmlPart[] = [];
  let last = 0;
  for (const match of html.matchAll(PLACEHOLDER)) {
    const diff = decode(match[1]!);
    if (!diff) continue;
    if (match.index > last) {
      parts.push({ kind: "html", html: html.slice(last, match.index) });
    }
    parts.push({ kind: "diff", ...diff });
    last = match.index + match[0].length;
  }
  if (last < html.length) parts.push({ kind: "html", html: html.slice(last) });
  return parts;
}
