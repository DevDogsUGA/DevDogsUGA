/**
 * Reading CSV the way spreadsheets write it: RFC 4180 quoting, CRLF or LF, and
 * the byte-order mark Excel puts in front of UTF-8.
 */

/** RFC 4180 rows: quoted fields may hold commas, quotes (`""`) and newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/**
 * The row most likely to be the header when none has the usual names: the
 * widest row among the first ten. Lets a column picker offer something to
 * choose from for an export the parser does not recognize.
 */
export function guessHeaderRow(text: string): string[] {
  const rows = parseCsv(text).slice(0, 10);
  let best: string[] = [];
  for (const row of rows) {
    if (
      row.filter((c) => c.trim()).length > best.filter((c) => c.trim()).length
    )
      best = row;
  }
  return best.map((c) => c.trim());
}
