import { isPlaceholder } from "./registry.js";

/**
 * Writing discovered IDs back into `registry.ts`.
 *
 * This is a source transform on this package's own file, which is why it lives
 * here rather than in the CLI that calls it. It rewrites `todo()` calls,
 * `fldTODO_` placeholders, and the header paragraph. That shape is defined
 * three modules over, and a rewriter that drifts from it fails by silently
 * replacing nothing.
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
  /** How many placeholder calls or stale resolved IDs were replaced. */
  replaced: number;
  /**
   * IDs with no source expression to replace, and a header that no longer
   * matches. Surfaced rather than thrown: a stale header is worth reporting
   * and not worth refusing a correct set of IDs over.
   */
  warnings: string[];
}

/**
 * The header section that describes the not-yet-scaffolded state, and what
 * replaces it once it is no longer true.
 *
 * Rewritten rather than left alone because the old text opens with "Every `id`
 * below is a PLACEHOLDER". A comment that survives its own subject is worse
 * than no comment, since the next reader has no reason to doubt it.
 */
export const HEADER_PLACEHOLDER_SECTION = ` * ## Field IDs are placeholders until the base exists
 *
 * Every \`id\` below is a PLACEHOLDER. The base has not been scaffolded yet, and
 * the bootstrapping order is deliberately circular-looking:
 *
 *   1. \`pnpm devtools airtable apply\` reads the shape below — table names,
 *      field names, types — and creates what is missing through the Meta API.
 *   2. The same run reads the schema back and writes the real field IDs in
 *      here, alongside a refreshed \`schema-snapshot.json\`.
 *   3. Both files are committed.
 *
 * After that first run the IDs are source. \`verify.ts\` FAILS on any remaining
 * placeholder rather than warning, because a placeholder that reaches a live
 * sync writes into nothing and reports success.
 */`;

export const HEADER_REAL_SECTION = ` * ## The IDs below are real, and are the wire format
 *
 * Written by \`pnpm devtools airtable apply\` from the live base. Every read and
 * write goes over the wire with these rather than with field NAMES, which is
 * what lets an officer rename a column without breaking the sync.
 *
 * To add a field: declare it here with a \`todo("slug")\` id and run
 * \`pnpm devtools airtable apply\`, which creates it in the base and fills the
 * real id in here. \`verify.ts\` FAILS on any remaining placeholder rather than
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
 * Whether any `todo("...")` call remains in CODE, not in prose.
 *
 * Comments have to be stripped first, from both halves of the file: the
 * registry declares `function todo(slug: string)` a few lines up, and the
 * header this module writes explains the workflow using the literal text
 * `todo("slug")`. A naive search for `todo(` or `todo("` matches one of those
 * on every run, which is why the stale-header warning below could never fire
 * before.
 */
function hasPlaceholderCalls(source: string): boolean {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  return /\btodo(Table)?\("/.test(code);
}

/**
 * Replace every registry ID that disagrees with the live field it resolved to.
 *
 * Most entries are either placeholders becoming real for the first time, or
 * already-resolved IDs mapping to themselves. The third case matters just as
 * much: deleting and recreating an Airtable field preserves its name but gives
 * it a new ID. `discoverIds` finds that replacement by name, and ignoring it
 * here leaves `registry.ts` stale while `apply` reports success and refreshes
 * the snapshot with the new ID.
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
    for (const [registered, real] of Object.entries(ids)) {
      if (registered === real) continue;

      const before = next;
      if (isPlaceholder(registered)) {
        const slug = slugOf(registered);
        const call = new RegExp(`${helper}\\("${escape(slug)}"\\)`, "g");
        next = next.replace(call, `"${real}"`);
        if (next === before) {
          warnings.push(`no ${helper}("${slug}") call to replace`);
        }
      } else {
        // Registry source is formatted with double quotes, but accept single
        // quotes too so this transform does not depend on Prettier having run
        // before it. Exact quoted literals avoid touching prose or a longer ID.
        next = next
          .replaceAll(`"${registered}"`, `"${real}"`)
          .replaceAll(`'${registered}'`, `'${real}'`);
        if (next === before) {
          warnings.push(`no registry literal for stale ID ${registered}`);
        }
      }

      if (next !== before) replaced += 1;
    }
  }

  // The helpers stay, since adding a field later uses them again. The header
  // does not: it opens by telling the reader that every ID below is fake.
  if (next.includes(HEADER_PLACEHOLDER_SECTION)) {
    next = next.replace(HEADER_PLACEHOLDER_SECTION, HEADER_REAL_SECTION);
  } else if (
    replaced > 0 &&
    !hasPlaceholderCalls(next) &&
    !next.includes(HEADER_REAL_SECTION)
  ) {
    warnings.push(
      "The registry header no longer matches the text this rewrite replaces. " +
        "Check that it does not still claim the IDs are placeholders.",
    );
  }

  return { source: next, replaced, warnings };
}
