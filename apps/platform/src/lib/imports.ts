/**
 * What the console's import preview and result look like on the wire, and the
 * pure helpers both sides share. Nothing here touches the database or the
 * server, so the client components can import it.
 */

export type ImportKind = "attendance" | "roster";

/**
 * `add` only ever adds. `replace` is the second mode of each kind: for
 * attendance it removes earlier imported check-ins the file no longer lists;
 * for the roster it is the authoritative snapshot, which also removes
 * verification from members absent from the file.
 */
export type ImportMode = "add" | "replace";

/** The largest upload accepted, checked before the file is read (Q77). */
export const MAX_UPLOAD_BYTES = 1_000_000;

/** Rows beyond this are refused: far past any roster or sign-in sheet. */
export const MAX_UPLOAD_ROWS = 20_000;

/** The most rows listed in a preview or error report. */
export const MAX_LISTED_ROWS = 1_000;

export interface MappingField {
  key: string;
  label: string;
  required: boolean;
}

/** Which header the importer reads each field from; null reads none. */
export type ImportMapping = Record<string, string | null>;

export interface InvalidRow {
  /** 1-based line in the file; null when the problem is the whole file. */
  line: number | null;
  /** The address or cell that was wrong, as uploaded. */
  value: string;
  reason: string;
}

export interface SummaryLine {
  label: string;
  count: number;
  /** `remove` marks lines that take something away, shown with warning tone. */
  tone?: "remove";
}

export interface SampleList {
  heading: string;
  items: string[];
  /** How many more there are beyond `items`. */
  more: number;
}

export interface ImportPreview {
  kind: ImportKind;
  mode: ImportMode;
  fileName: string;
  headers: string[];
  mappingFields: MappingField[];
  mapping: ImportMapping;
  /** The meeting an attendance import records into. */
  meeting: { id: string; title: string; when: string } | null;
  summary: SummaryLine[];
  samples: SampleList[];
  warnings: string[];
  invalid: InvalidRow[];
  /** Rows beyond the listed ones, when there are more than the cap. */
  invalidMore: number;
  /** Why Confirm is unavailable, or null when it is allowed. */
  blocked: string | null;
  /** Hash of everything the outcome depends on; the confirm step re-checks it. */
  fingerprint: string;
}

export type ImportStatus = "done" | "partial" | "stopped" | "nothing";

export interface ImportResult {
  status: ImportStatus;
  kind: ImportKind;
  mode: ImportMode;
  message: string;
  counts: SummaryLine[];
  failures: { email: string; reason: string }[];
  invalid: InvalidRow[];
  invalidMore: number;
}

export type ImportResponse =
  | { kind: "preview"; preview: ImportPreview; notice?: string }
  | { kind: "result"; result: ImportResult }
  | {
      kind: "needs-mapping";
      preview: null;
      headers: string[];
      mappingFields: MappingField[];
      mapping: ImportMapping;
      message: string;
    }
  | { kind: "error"; message: string };

function csvCell(value: string | number | null): string {
  const text = value === null ? "" : String(value);
  // A spreadsheet runs a cell that opens with one of these as a formula.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * The downloadable error report (Q70): one row per row that was not imported,
 * with its line in the original file, so it can be corrected and retried.
 * Built in the browser from what the server returned; the upload itself is
 * never kept (Q73).
 */
export function errorReportCsv(
  invalid: readonly InvalidRow[],
  failures: readonly { email: string; reason: string }[] = [],
): string {
  const rows: (string | number | null)[][] = [
    ["Line", "Value", "Problem"],
    ...invalid.map((r) => [r.line, r.value, r.reason]),
    ...failures.map((f) => [null, f.email, `Account not created: ${f.reason}`]),
  ];
  return `${rows.map((r) => r.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
