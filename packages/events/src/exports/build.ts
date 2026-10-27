/**
 * An export held in memory: rows in, files and a report of what was left out
 * out. The console builds its downloads with this; the CLI streams the same
 * formats to disk instead. Both write through the same `Format`s, so a file
 * from either is the same bytes.
 */
import {
  bevyFormat,
  bevyRequiredColumns,
  bevySurvey,
  formatFor,
  type Format,
  type FormatName,
  type Row,
} from "./formats.js";
import { BOM, csvRow } from "./write.js";
import { EXPORTS, type ExportKind } from "./queries.js";

export interface BuiltFile {
  format: FormatName;
  label: string;
  /** `attendance-2026-09-09-bevy.csv`. */
  name: string;
  mime: string;
  /** The whole file, byte-order mark included where the format has one. */
  text: string;
  /** Lines written: rows, people or emails, by the format's unit. */
  count: number;
  unit: [one: string, many: string];
}

export interface LeftOut {
  format: FormatName;
  formatLabel: string;
  /** Not in the file at all, or in it without their survey answers. */
  outcome: "not in file" | "survey answers left out";
  userId: string;
  name: string;
  email: string;
  reason: string;
}

export interface NameParts {
  meetingSlug?: string;
  /** `YYYY-MM-DD`, as the officer chose them. */
  from?: string;
  to?: string;
}

function stem(kind: ExportKind, parts: NameParts): string {
  const out: string[] = [kind];
  if (parts.meetingSlug) out.push(parts.meetingSlug);
  if (parts.from) out.push(parts.from.slice(0, 10));
  if (parts.to) out.push(parts.to.slice(0, 10));
  return out.join("-");
}

/** `<kind>[-<meeting>][-<from>][-<to>][-<format>].<ext>`, the CLI's name for it. */
export function exportFileName(
  kind: ExportKind,
  parts: NameParts,
  format: Format,
): string {
  const suffix = format.suffix ? `-${format.suffix}` : "";
  return `${stem(kind, parts)}${suffix}.${format.extension}`;
}

export function zipFileName(kind: ExportKind, parts: NameParts): string {
  return `${stem(kind, parts)}.zip`;
}

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

const MIME: Record<Format["extension"], string> = {
  csv: "text/csv; charset=utf-8",
  txt: "text/plain; charset=utf-8",
};

export interface BuildInput {
  kind: ExportKind;
  formats: readonly FormatName[];
  /** The export's rows, as the query returns them (transform applied). */
  rows: readonly Row[];
  /** The meeting's `responses` rows; read only when Bevy is asked for. */
  surveyRows?: readonly Row[];
  name?: NameParts;
}

export function buildExportFiles(input: BuildInput): {
  files: BuiltFile[];
  leftOut: LeftOut[];
} {
  const { columns } = EXPORTS[input.kind];
  const files: BuiltFile[] = [];
  const leftOut: LeftOut[] = [];
  for (const name of input.formats) {
    let format = formatFor(name, columns);
    let withheld = new Map<string, string[]>();
    if (name === "bevy") {
      const survey = bevySurvey(input.surveyRows ?? [], bevyRequiredColumns());
      withheld = survey.withheld ?? new Map<string, string[]>();
      format = bevyFormat(survey);
    }
    const writer = format.writer();
    const paged = writer.page(input.rows);
    const end = writer.end?.();
    const body = format.head + paged.text + (end?.text ?? "");
    const count = paged.count + (end?.count ?? 0);
    for (const row of writer.omitted()) {
      leftOut.push({
        format: format.name,
        formatLabel: format.label,
        outcome: "not in file",
        userId: text(row.user_id),
        name: text(row.preferred_name),
        email: text(row.email),
        reason: `No ${format.needs} on file`,
      });
    }
    for (const [userId, lacking] of withheld) {
      const row = input.rows.find((r) => text(r.user_id) === userId);
      leftOut.push({
        format: format.name,
        formatLabel: format.label,
        outcome: "survey answers left out",
        userId,
        name: text(row?.preferred_name),
        email: text(row?.email),
        reason: `Bevy requires every registration question; no answer for ${lacking.join(", ")}`,
      });
    }
    files.push({
      format: format.name,
      label: format.label,
      name: exportFileName(input.kind, input.name ?? {}, format),
      mime: MIME[format.extension],
      text: (format.bom ? BOM : "") + body,
      count,
      unit: format.unit,
    });
  }
  return { files, leftOut };
}

/** The downloadable report of who was left out of which file, and why. */
export function leftOutCsv(leftOut: readonly LeftOut[]): string {
  return (
    BOM +
    csvRow(["file", "outcome", "user_id", "name", "email", "reason"]) +
    leftOut
      .map((l) =>
        csvRow([l.formatLabel, l.outcome, l.userId, l.name, l.email, l.reason]),
      )
      .join("")
  );
}
