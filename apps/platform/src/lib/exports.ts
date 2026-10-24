/**
 * What the console's Exports page sends and gets back, and the choices it
 * offers. Nothing here touches the database or the server, so the client
 * component can import it.
 */

/**
 * The datasets the console exports. Stars are not among them: the EL evidence
 * export replaces that one, and `backstage export stars` stays until then.
 */
export const CONSOLE_EXPORT_KINDS = [
  "attendance",
  "reflections",
  "responses",
] as const;
export type ConsoleExportKind = (typeof CONSOLE_EXPORT_KINDS)[number];

export interface ExportRequest {
  kind: ConsoleExportKind;
  formats: string[];
  /** `YYYY-MM-DD`, an Eastern day. */
  from: string | null;
  /** `YYYY-MM-DD`, an Eastern day, inclusive. */
  to: string | null;
  meetingId: string | null;
  /** Bundle the files (and the left-out report) into one ZIP. */
  zip: boolean;
}

export interface ExportedFile {
  name: string;
  mime: string;
  /** The file's text; null when it travels inside the ZIP instead. */
  text: string | null;
  count: number;
  unit: [one: string, many: string];
  label: string;
}

export interface LeftOutRow {
  file: string;
  outcome: string;
  name: string;
  email: string;
  reason: string;
}

export type ExportResponse =
  | {
      kind: "ready";
      files: ExportedFile[];
      zip: { name: string; base64: string } | null;
      /** Total people left out across files; the list below is capped. */
      leftOutTotal: number;
      leftOut: LeftOutRow[];
      /** The full report as CSV; null when nobody was left out. */
      report: { name: string; text: string } | null;
    }
  | { kind: "error"; message: string };

/** The most left-out rows listed on the page; the report has them all. */
export const MAX_LISTED_LEFT_OUT = 100;

/** Rows beyond this are refused: narrow the range instead. */
export const MAX_EXPORT_ROWS = 100_000;
