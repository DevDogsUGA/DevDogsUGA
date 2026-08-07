import { isPlaceholder } from "./registry.js";

/**
 * Writing discovered IDs back into `registry.ts`.
 *
 * This is a source transform on this package's own file, which is why it lives
 * here rather than in the CLI that calls it: the shape it rewrites — `todo()`
 * calls, `fldTODO_` placeholders, the header paragraph — is defined three
 * modules over, and a rewriter that drifts from it fails by silently replacing
 * nothing.
 *
 * Kept pure so it can be tested without a base. The caller reads the file,
 * passes the text through, and writes the result.
 */

export interface DiscoveredIds {
  /** Placeholder id -> real id, as `discoverIds` returns them. */
  tables: Record<string, string>;
  fields: Record<string, string>;
}

export interface ApplyIdsResult {
  source: string;
  /** How many `todo()` / `todoTable()` calls were replaced. */
  replaced: number;
  /**
   * Placeholders with no call to replace, and a header that no longer matches.
   * Surfaced rather than thrown: a stale header is worth reporting and not
   * worth refusing a correct set of IDs over.
   */
  warnings: string[];
}

/**
 * The header section that describes the not-yet-scaffolded state, and what
 * replaces it once it is no longer true.
 *
 * Rewritten rather than left alone because the old text opens with "Every `id`
 * below is a PLACEHOLDER" — a comment that survives its own subject is worse
 * than no comment, since the next reader has no reason to doubt it.
 */
export const HEADER_PLACEHOLDER_SECTION = ` * ## Field IDs are placeholders until the base exists
 *
 * Every \`id\` below is a PLACEHOLDER. The base has not been scaffolded yet, and
 * the bootstrapping order is deliberately circular-looking:
 *
 *   1. \`pnpm airtable:scaffold\` reads the shape below — table names, field
 *      names, types — and creates what is missing through the Meta API.
 *   2. It reads the schema back and prints the real field IDs.
 *   3. \`pnpm airtable:pull-ids\` writes them in here, and the result is
 *      committed.
 *
 * After that first run the IDs are source. \`verify.ts\` FAILS on any remaining
 * placeholder rather than warning, because a placeholder that reaches a live
 * sync writes into nothing and reports success.
 */`;

export const HEADER_REAL_SECTION = ` * ## The IDs below are real, and are the wire format
 *
 * Written by \`pnpm airtable:pull-ids\` from the live base. Every read and write
 * goes over the wire with these rather than with field NAMES, which is what
 * lets an officer rename a column without breaking the sync.
 *
 * To add a field: declare it here with a \`todo("slug")\` id, run
 * \`pnpm airtable:scaffold\` to create it, then \`pnpm airtable:pull-ids\` to fill
 * the real id in. \`verify.ts\` FAILS on any remaining placeholder rather than
 * warning, because a placeholder that reaches a live sync writes into nothing
 * and reports success.
 */`;

/** `fldTODO_members_uga_email` -> the slug `todo()` was called with. */
function slugOf(placeholder: string): string {
  return placeholder.replace(/^(fld|tbl)TODO_/, "");
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Whether any `todo("...")` call remains — in CODE, not in prose.
 *
 * Comments have to be stripped first, and by both halves of the file: the
 * registry declares `function todo(slug: string)` a few lines up, and the
 * header this module writes explains the workflow using the literal text
 * `todo("slug")`. A naive search for either `todo(` or `todo("` matches one of
 * those on every run, which is why the stale-header warning below could never
 * fire before.
 */
function hasPlaceholderCalls(source: string): boolean {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  return /\btodo(Table)?\("/.test(code);
}

/**
 * Replace every `todo("slug")` call with the id the base assigned it.
 *
 * Only the placeholders are considered. Every already-resolved entry maps its
 * own real id to itself, and warning about those made adding ONE table print
 * six complaints about the six that were already fine.
 */
export function applyDiscoveredIds(
  source: string,
  found: DiscoveredIds,
): ApplyIdsResult {
  const warnings: string[] = [];
  let replaced = 0;
  let next = source;

  const passes: [Record<string, string>, string][] = [
    [found.fields, "todo"],
    [found.tables, "todoTable"],
  ];

  for (const [ids, helper] of passes) {
    for (const [placeholder, real] of Object.entries(ids)) {
      if (!isPlaceholder(placeholder)) continue;
      const slug = slugOf(placeholder);
      const call = new RegExp(`${helper}\\("${escape(slug)}"\\)`, "g");
      const before = next;
      next = next.replace(call, `"${real}"`);
      if (next !== before) replaced += 1;
      else warnings.push(`no ${helper}("${slug}") call to replace`);
    }
  }

  // The helpers stay -- adding a field later uses them again. The header does
  // not: it opens by telling the reader that every ID below is fake, and a
  // comment that outlives its own subject is worse than no comment at all.
  if (next.includes(HEADER_PLACEHOLDER_SECTION)) {
    next = next.replace(HEADER_PLACEHOLDER_SECTION, HEADER_REAL_SECTION);
  } else if (replaced > 0 && !hasPlaceholderCalls(next)) {
    warnings.push(
      "The registry header no longer matches the text this rewrite replaces. " +
        "Check that it does not still claim the IDs are placeholders.",
    );
  }

  return { source: next, replaced, warnings };
}
