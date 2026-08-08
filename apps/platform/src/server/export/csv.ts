/**
 * RFC 4180 serialization.
 *
 * Pure and separate because the format is a contract with importers nobody
 * here controls, and every rule below is one that fails silently: a missing
 * quote shifts every subsequent column, a bare local timestamp is read in the
 * importer's zone, and a `null` rendered as the word "null" becomes a member
 * named null.
 */

/** The format contract's stability rules, encoded. */
export const LINE_ENDING = "\r\n";

/**
 * Quotes a field only when it has to be quoted.
 *
 * The four triggers are the whole of RFC 4180: a comma, a quote, a carriage
 * return or a line feed. Quoting everything would also be valid and is what
 * most hand-rolled serializers do; not quoting everything keeps the file
 * readable in a terminal, which is where somebody debugging an import will
 * open it.
 *
 * A leading `=`, `+`, `-` or `@` is additionally prefixed with a tab. Those
 * are the four characters spreadsheets treat as the start of a formula, and a
 * member is entirely capable of naming their team `=cmd|'/c calc'!A1`. The tab
 * is invisible in a cell and neutralises the injection — this is the one place
 * the serializer is not a pure encoding, and it is worth it.
 */
export function csvField(value: unknown): string {
  if (value === null || value === undefined) return "";

  // Narrowed per type rather than a bare `String()`, which is what this used to
  // be (behind a ternary whose branches were identical). Two things reach a
  // spreadsheet silently wrong otherwise, and both are the failure mode the
  // whole file is shaped against:
  //
  //   * An object stringifies to "[object Object]" — a perfectly valid CSV cell
  //     that has dropped the data, in a file nobody re-reads until an import has
  //     already gone wrong.
  //   * A Date stringifies to a bare local time. `csvTimestamp` exists
  //     precisely so that does not reach an importer in another zone, and
  //     `project` in `csvStream` returns `unknown[]`, so nothing stops a caller
  //     handing one straight over.
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
    // Lossy but legible, and never silent: a reviewer opening the file sees
    // JSON in a cell and knows the projection is wrong. `JSON.stringify`
    // returns undefined for a function or symbol, which is not data either.
    text = JSON.stringify(value) ?? "";
  }

  const guarded = /^[=+\-@\t\r]/.test(text) ? `\t${text}` : text;

  if (!/[",\r\n]/.test(guarded)) return guarded;
  return `"${guarded.replace(/"/g, '""')}"`;
}

export function csvRow(values: unknown[]): string {
  return values.map(csvField).join(",") + LINE_ENDING;
}

/**
 * ISO 8601 with an explicit offset, never a bare local time.
 *
 * A timestamp without an offset is read in whatever zone the importer happens
 * to run in, which for a club whose meetings all start at 18:00 Eastern means
 * a spreadsheet in another zone showing the wrong evening.
 */
export function csvTimestamp(value: Date | string | null): string {
  if (value === null) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

/**
 * Streams rows without buffering the whole file.
 *
 * The stars export is one row per `(member, workshop)` across every semester,
 * so it grows with the club rather than staying small. Buffering it would work
 * for years and then not, on a Worker with a fixed memory ceiling — and the
 * streaming version is barely longer.
 */
export function csvStream<T>(
  header: string[],
  rows: AsyncIterable<T>,
  project: (row: T) => unknown[],
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      // UTF-8 BOM. Excel on Windows reads a BOM-less UTF-8 CSV as the system
      // codepage, which turns every non-ASCII name into mojibake — and a
      // member surname is exactly where that shows up.
      controller.enqueue(encoder.encode("\uFEFF"));
      controller.enqueue(encoder.encode(csvRow(header)));

      try {
        for await (const row of rows) {
          controller.enqueue(encoder.encode(csvRow(project(row))));
        }
      } catch (error) {
        controller.error(error);
        return;
      }

      controller.close();
    },
  });
}
