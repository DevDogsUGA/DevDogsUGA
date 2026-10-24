/**
 * RFC 4180 writing, carried over from the platform's `server/export/csv.ts`
 * when the exports moved here, rules and all.
 *
 * The format is a contract with importers nobody here controls, and every rule
 * fails silently: a missing quote shifts every later column, a bare local
 * timestamp is read in the importer's zone, and a `null` rendered as the word
 * "null" becomes a member named null.
 */

/** CRLF, the line ending RFC 4180 specifies. */
export const LINE_ENDING = "\r\n";

/**
 * UTF-8 byte-order mark. Excel on Windows reads a BOM-less UTF-8 CSV as the
 * system codepage, turning every non-ASCII name into mojibake.
 */
export const BOM = "﻿";

/**
 * Quotes a field only when it has to be: a comma, a quote, a carriage return
 * or a line feed. Quoting only what needs it keeps the file readable in a
 * terminal.
 *
 * A leading `=`, `+`, `-`, `@`, tab or carriage return gets a tab prefix:
 * spreadsheets start a formula on the first four, and a member can name their
 * team `=cmd|'/c calc'!A1`. The tab is invisible in a cell and neutralises it.
 */
export function csvField(value: unknown): string {
  if (value === null || value === undefined) return "";

  let text: string;
  if (typeof value === "string") {
    text = value;
  } else if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    text = String(value);
  } else if (value instanceof Date) {
    text = csvTimestamp(value);
  } else {
    // Lossy but legible, and never silent: JSON in a cell tells a reviewer
    // the projection is wrong. A function or symbol is not data either.
    text = JSON.stringify(value) ?? "";
  }

  const guarded = /^[=+\-@\t\r]/.test(text) ? `\t${text}` : text;
  if (!/[",\r\n]/.test(guarded)) return guarded;
  return `"${guarded.replace(/"/g, '""')}"`;
}

export function csvRow(values: readonly unknown[]): string {
  return values.map(csvField).join(",") + LINE_ENDING;
}

/**
 * ISO 8601 with an explicit offset, never a bare local time: a timestamp
 * without one is read in whatever zone the importer runs in.
 */
export function csvTimestamp(value: Date | string | null): string {
  if (value === null) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}
