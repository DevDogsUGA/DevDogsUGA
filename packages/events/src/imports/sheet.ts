/**
 * Reading a sign-in sheet: a Google or Microsoft Forms response export, or a
 * spreadsheet an officer typed up. There is no fixed layout, so the columns
 * are found rather than assumed:
 *
 * - the header is the first row (of the first ten) that names a column with
 *   "email" or "name" and holds no addresses itself;
 * - the email column is `--email-column`, else the header mentioning "email"
 *   whose values are most often UGA addresses (a form can have both the
 *   respondent's account email and a "UGA email" question), else whichever
 *   column holds the most addresses;
 * - the name is `--name-column`, else "First Name" + "Last Name", else the
 *   first header mentioning "name" that is not an email or username column.
 *   It is optional: it only matters when an account has to be created.
 *
 * A sheet with no header at all (a pasted list of addresses) is read as every
 * address in every cell.
 *
 * Only UGA (MyID) addresses are imported: that is the address an account is
 * created for and the one members sign in with. Anything else is reported.
 */
import { parseCsv } from "./csv.js";
import { ImportInputError, MissingColumnsError } from "./errors.js";

export interface Attendee {
  /** Lowercased UGA address. */
  email: string;
  name: string | null;
  /** 1-based line in the file, for messages. */
  line: number;
}

export interface SheetOptions {
  emailColumn?: string;
  /** A header to read names from; `null` reads none; unset finds one. */
  nameColumn?: string | null;
}

export interface ParsedSheet {
  /** One per address, first appearance kept. */
  attendees: Attendee[];
  /** The headers used, for the preview; null when there was no header. */
  emailColumn: string | null;
  nameColumn: string | null;
  notUga: { email: string; line: number }[];
  /** Lines with content but no address. */
  missingEmail: number[];
  /** Repeat rows for an address already read. */
  duplicates: number;
  /** The header row's cells, for a column picker; empty without a header. */
  headers: string[];
}

const ADDRESS = /[^\s<>,;:"'()[\]]+@[^\s<>,;:"'()[\]]+\.[a-z]{2,}/i;
const UGA = /@uga\.edu$/i;

function addressIn(cell: string | undefined): string | null {
  const match = ADDRESS.exec(cell ?? "");
  return match ? match[0].toLowerCase() : null;
}

const norm = (h: string) => h.trim().toLowerCase();

function findHeader(rows: string[][], options: SheetOptions): number {
  const wanted = [options.emailColumn, options.nameColumn]
    .filter((c): c is string => !!c)
    .map(norm);
  for (let i = 0; i < Math.min(rows.length, 10); i += 1) {
    const cells = rows[i]!.map(norm);
    if (wanted.length > 0) {
      if (wanted.every((w) => cells.includes(w))) return i;
      continue;
    }
    if (cells.some((c) => c.includes("@"))) continue;
    if (cells.some((c) => /e-?mail|\bname\b/.test(c))) return i;
  }
  if (wanted.length > 0) {
    throw new ImportInputError(
      `No header row names ${wanted.map((w) => `"${w}"`).join(" and ")}.`,
    );
  }
  return -1;
}

function columnNamed(header: readonly string[], name: string): number {
  const i = header.map(norm).indexOf(norm(name));
  if (i < 0) {
    throw new ImportInputError(
      `No column called "${name}". The columns are: ${header
        .map((h) => `"${h.trim()}"`)
        .join(", ")}.`,
    );
  }
  return i;
}

function emailColumn(
  header: readonly string[],
  body: readonly string[][],
  options: SheetOptions,
): number {
  if (options.emailColumn) return columnNamed(header, options.emailColumn);
  const count = (i: number, test: RegExp) =>
    body.filter((r) => test.test(addressIn(r[i]) ?? "")).length;
  const named = header
    .map((h, i) => ({ i, h: norm(h) }))
    .filter(({ h }) => /e-?mail/.test(h))
    .map(({ i }) => i);
  const pool = named.length > 0 ? named : header.map((_, i) => i);
  const best = pool
    .map((i) => ({ i, uga: count(i, UGA), any: count(i, /@/) }))
    .sort((a, b) => b.uga - a.uga || b.any - a.any || a.i - b.i)[0];
  if (!best || best.any === 0) {
    throw new MissingColumnsError(
      "Could not find a column of email addresses.",
    );
  }
  return best.i;
}

/** The name for a row, or how to build it. */
function nameReader(
  header: readonly string[],
  options: SheetOptions,
): { label: string | null; read: (row: readonly string[]) => string | null } {
  const at = (i: number) => (row: readonly string[]) =>
    row[i]?.trim() ? row[i].trim() : null;
  if (options.nameColumn === null) return { label: null, read: () => null };
  if (options.nameColumn) {
    const i = columnNamed(header, options.nameColumn);
    return { label: header[i]!.trim(), read: at(i) };
  }
  const cells = header.map(norm);
  const first = cells.findIndex(
    (c) => c.includes("first") && c.includes("name"),
  );
  const last = cells.findIndex((c) => c.includes("last") && c.includes("name"));
  if (first >= 0 && last >= 0) {
    return {
      label: `${header[first]!.trim()} + ${header[last]!.trim()}`,
      read: (row) => {
        const name = [row[first], row[last]]
          .map((v) => v?.trim())
          .filter(Boolean)
          .join(" ");
        return name || null;
      },
    };
  }
  const i = cells.findIndex(
    (c) => /\bname\b/.test(c) && !/e-?mail|user/.test(c),
  );
  return i >= 0
    ? { label: header[i]!.trim(), read: at(i) }
    : { label: null, read: () => null };
}

export function parseSheet(
  text: string,
  options: SheetOptions = {},
): ParsedSheet {
  const rows = parseCsv(text);
  const headerAt = findHeader(rows, options);
  const out: ParsedSheet = {
    attendees: [],
    emailColumn: null,
    nameColumn: null,
    notUga: [],
    missingEmail: [],
    duplicates: 0,
    headers: [],
  };
  const seen = new Set<string>();
  const add = (email: string, name: string | null, line: number) => {
    if (!UGA.test(email)) {
      out.notUga.push({ email, line });
    } else if (seen.has(email)) {
      out.duplicates += 1;
    } else {
      seen.add(email);
      out.attendees.push({ email, name, line });
    }
  };

  if (headerAt < 0) {
    rows.forEach((row, i) => {
      for (const cell of row) {
        const email = addressIn(cell);
        if (email) add(email, null, i + 1);
      }
    });
    return out;
  }

  const header = rows[headerAt]!;
  out.headers = header.map((h) => h.trim());
  const body = rows.slice(headerAt + 1);
  const emailAt = emailColumn(header, body, options);
  const name = nameReader(header, options);
  out.emailColumn = header[emailAt]!.trim() || `column ${emailAt + 1}`;
  out.nameColumn = name.label;

  body.forEach((row, i) => {
    const line = headerAt + i + 2;
    if (row.every((c) => !c.trim())) return;
    const email = addressIn(row[emailAt]);
    if (!email) {
      out.missingEmail.push(line);
      return;
    }
    add(email, name.read(row), line);
  });
  return out;
}
