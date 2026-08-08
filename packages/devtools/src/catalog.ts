/**
 * What can be reported on this instance, and for what reasons?
 *
 * Neither half of that question had an answer in the CLI before. `doctor` comes
 * closest, but it runs `conformance_check()` for a single app and reports
 * pass/fail per content type -- a diagnostic, not a listing -- and it says
 * nothing about reasons at all.
 *
 * It matters more now than it used to, because both halves stopped being
 * editable at runtime. Content types are derived from each app's own schema and
 * report reasons are a platform-owned enum, so there is no configuration page
 * to open and look at; the database is the only source of truth, and this is
 * how a contributor reads it. `docs/platform/reporting-and-feedback.md` carries
 * a copy of the reason list for people who are not at a terminal, but that copy
 * is maintained by hand and says so -- this is what settles a disagreement.
 *
 * Both calls run as the seeded moderator rather than through an admin client.
 * `list_content_types` is `security definer` behind a `canModerate` check, so
 * an anonymous or ordinary client sees nothing, and `list_report_reasons` is
 * `security invoker` and subject to RLS. Using a persona means what prints here
 * is what a moderator would actually see, rather than what a superuser can.
 */
import { personaClient, PERSONAS, type Instance } from "./instance.js";

export interface CatalogReason {
  reason: string;
  title: string;
  description: string | null;
}

export interface CatalogContentType {
  appSlug: string;
  contentType: string;
  label: string;
  tableName: string;
  schemaName: string;
  visibility: string;
  /** Null when the table carries no foreign key to reportResolutions. */
  quarantineColumn: string | null;
  /** Null when no single-column primary key could be derived. */
  refColumn: string | null;
  authorColumn: string | null;
}

export interface Catalog {
  reasons: CatalogReason[];
  contentTypes: CatalogContentType[];
}

export async function readCatalog(instance: Instance): Promise<Catalog> {
  const client = await personaClient(instance, PERSONAS.moderator);

  const [reasons, contentTypes] = await Promise.all([
    client.rpc("list_report_reasons"),
    client.rpc("list_content_types"),
  ]);

  if (reasons.error) throw new Error(reasons.error.message);
  if (contentTypes.error) throw new Error(contentTypes.error.message);

  return {
    reasons: (reasons.data ?? []) as CatalogReason[],
    contentTypes: (contentTypes.data ?? []) as CatalogContentType[],
  };
}

/**
 * Formats the catalog for `note()`.
 *
 * Content types are grouped by app because that is how a contributor thinks
 * about them -- "what does *my* app expose?" -- and a type that cannot be
 * quarantined or cannot be addressed is called out inline rather than left to
 * be inferred from a blank column. Those are the two states that look like
 * working configuration and are not.
 */
export function renderCatalog(catalog: Catalog): string {
  const lines: string[] = [];

  lines.push("Report reasons — one global list, every app, every content type");
  for (const r of catalog.reasons) {
    lines.push(`  ${r.reason.padEnd(16)} ${r.title}`);
  }
  if (catalog.reasons.length === 0) {
    lines.push("  (none — the presentation table is empty, which is a bug)");
  }

  lines.push("");
  lines.push("Content types — derived from each app's schema, not configured");

  const byApp = new Map<string, CatalogContentType[]>();
  for (const t of catalog.contentTypes) {
    byApp.set(t.appSlug, [...(byApp.get(t.appSlug) ?? []), t]);
  }

  if (byApp.size === 0) {
    lines.push("  (none — no registered app declares any moderatable content)");
  }

  for (const [app, types] of [...byApp].sort()) {
    lines.push(`  ${app}`);
    for (const t of types) {
      const notes: string[] = [];
      if (!t.quarantineColumn) notes.push("no quarantine column");
      if (!t.refColumn) notes.push("NOT ADDRESSABLE: no single-column key");
      if (!t.authorColumn) notes.push("no author column derived");
      const suffix = notes.length > 0 ? `  (${notes.join("; ")})` : "";
      lines.push(
        `    ${t.contentType.padEnd(14)} ${t.schemaName}.${t.tableName}` +
          `  [${t.visibility}]${suffix}`,
      );
    }
  }

  return lines.join("\n");
}
