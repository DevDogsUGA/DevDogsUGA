/**
 * Reading the UGA Involvement Network's "Organization Roster" export.
 *
 * The export is not a plain CSV. It opens with a title line, a blank line and
 * an `Organization,date` line before the header, hides most columns as
 * `(Hidden)`, and lists a person once per position they hold, so an officer
 * appears as both `Member` and `President`. The header is found rather than
 * assumed to be the first line, which is what broke the platform's upload: it
 * took `Organization Roster` for the header and found no rows.
 */

import { parseCsv } from "./csv.js";
import { MissingColumnsError } from "./errors.js";

export interface InvolvementMember {
  /** Lowercased campus (MyID) address. */
  email: string;
  firstName: string;
  lastName: string;
  /** Every position the export lists for this person, in export order. */
  positions: string[];
}

export interface ParsedRoster {
  /** One per person, in export order. */
  members: InvolvementMember[];
  /** The `Organization Name` column's values, when the export has one. */
  organizations: string[];
  /** Rows skipped for missing a name or an email, by line number. */
  skippedLines: number[];
  /** Emails listed under two different names; the first name is kept. */
  conflictingNames: string[];
  /** With `ugaOnly`: rows left out for a non-UGA address, by line number. */
  notUga: { email: string; line: number }[];
  /** The header row's cells, for a column picker. */
  headers: string[];
  /** The header cells read as first name, last name and email. */
  columns: { firstName: string; lastName: string; email: string };
}

/** Header cells to read instead of the usual names, matched ignoring case. */
export interface RosterOptions {
  columns?: { firstName?: string; lastName?: string; email?: string };
  /** Report addresses outside `@uga.edu` as `notUga` instead of keeping them. */
  ugaOnly?: boolean;
}

const UGA = /@uga\.edu$/i;

export class RosterFormatError extends MissingColumnsError {
  override name = "RosterFormatError";
}

/** Header names for each field, the first one present wins. */
const COLUMNS = {
  firstName: ["first name"],
  lastName: ["last name"],
  email: ["campus email", "email"],
  organization: ["organization name"],
  position: ["position name"],
} as const;

function columnIndex(header: readonly string[], names: readonly string[]) {
  const normalized = header.map((h) => h.trim().toLowerCase());
  for (const name of names) {
    const i = normalized.indexOf(name);
    if (i >= 0) return i;
  }
  return -1;
}

function clean(value: string | undefined): string {
  const v = (value ?? "").trim();
  return v === "(Hidden)" ? "" : v;
}

/** The names to look for: the picked column alone, else the usual ones. */
function wanted(
  picked: string | undefined,
  usual: readonly string[],
): readonly string[] {
  const name = picked?.trim().toLowerCase();
  return name ? [name] : usual;
}

export function parseRoster(
  text: string,
  options: RosterOptions = {},
): ParsedRoster {
  const rows = parseCsv(text);
  const names = {
    firstName: wanted(options.columns?.firstName, COLUMNS.firstName),
    lastName: wanted(options.columns?.lastName, COLUMNS.lastName),
    email: wanted(options.columns?.email, COLUMNS.email),
  };
  const headerAt = rows.findIndex(
    (r) =>
      columnIndex(r, names.firstName) >= 0 &&
      columnIndex(r, names.lastName) >= 0 &&
      columnIndex(r, names.email) >= 0,
  );
  if (headerAt < 0) {
    throw new RosterFormatError(
      options.columns
        ? "No header row has all three picked columns."
        : 'No header row with "First Name", "Last Name" and "Campus Email". ' +
            "Export the roster from the Involvement Network's Roster page " +
            "(Export → Organization Roster) and pass that file.",
    );
  }

  const header = rows[headerAt]!;
  const at = {
    firstName: columnIndex(header, names.firstName),
    lastName: columnIndex(header, names.lastName),
    email: columnIndex(header, names.email),
    organization: columnIndex(header, COLUMNS.organization),
    position: columnIndex(header, COLUMNS.position),
  };

  const byEmail = new Map<string, InvolvementMember>();
  const organizations = new Set<string>();
  const skippedLines: number[] = [];
  const conflicting = new Set<string>();
  const notUga: { email: string; line: number }[] = [];

  rows.slice(headerAt + 1).forEach((row, i) => {
    if (row.every((cell) => cell.trim() === "")) return;
    const email = clean(row[at.email]).toLowerCase();
    const firstName = clean(row[at.firstName]);
    const lastName = clean(row[at.lastName]);
    if (!email.includes("@") || !firstName || !lastName) {
      skippedLines.push(headerAt + i + 2);
      return;
    }
    if (options.ugaOnly && !UGA.test(email)) {
      notUga.push({ email, line: headerAt + i + 2 });
      return;
    }
    if (at.organization >= 0) {
      const org = clean(row[at.organization]);
      if (org) organizations.add(org);
    }
    const position = at.position >= 0 ? clean(row[at.position]) : "";
    const existing = byEmail.get(email);
    if (existing) {
      if (existing.firstName !== firstName || existing.lastName !== lastName) {
        conflicting.add(email);
      }
      if (position && !existing.positions.includes(position)) {
        existing.positions.push(position);
      }
      return;
    }
    byEmail.set(email, {
      email,
      firstName,
      lastName,
      positions: position ? [position] : [],
    });
  });

  return {
    members: [...byEmail.values()],
    organizations: [...organizations],
    skippedLines,
    conflictingNames: [...conflicting],
    notUga,
    headers: header.map((h) => h.trim()),
    columns: {
      firstName: header[at.firstName]!.trim(),
      lastName: header[at.lastName]!.trim(),
      email: header[at.email]!.trim(),
    },
  };
}
