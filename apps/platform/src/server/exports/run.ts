import {
  auditFilters,
  buildExportFiles,
  endOfDay,
  FORMAT_NAMES,
  formatFor,
  isDay,
  leftOutCsv,
  parseFormats,
  startOfDay,
  zipFileName,
  type ExportFilters,
  type FormatName,
  type NameParts,
} from "@devdogsuga/events/exports";
import JSZip from "jszip";
import { z } from "zod";
import type { ExportResponse, ExportRequest } from "~/lib/exports";
import { CONSOLE_EXPORT_KINDS, MAX_LISTED_LEFT_OUT } from "~/lib/exports";
import type { ExportDeps } from "./types";

const day = z.string().refine(isDay, "Dates look like 2026-09-30.").nullable();

export const exportRequestSchema = z.object({
  kind: z.enum(CONSOLE_EXPORT_KINDS),
  formats: z.array(z.string().max(30)).min(1).max(FORMAT_NAMES.length),
  from: day,
  to: day,
  meetingId: z.string().uuid().nullable(),
  zip: z.boolean(),
});

const fail = (message: string): ExportResponse => ({ kind: "error", message });

/** A request that checked out: the formats named, the dates as bounds. */
type Checked = {
  req: ExportRequest;
  formats: FormatName[];
  filters: ExportFilters;
  name: NameParts;
};

function check(req: ExportRequest): Checked | string {
  let formats: FormatName[];
  try {
    formats = parseFormats(req.formats, req.kind);
  } catch (err) {
    return err instanceof Error ? err.message : "Unknown format.";
  }
  if (formats.length === 0) return "Choose a format.";
  const perEvent = formats.filter((f) => formatFor(f, []).perEvent);
  if (perEvent.length > 0 && !req.meetingId) {
    return `${perEvent.map((f) => formatFor(f, []).label).join(" and ")} ${
      perEvent.length === 1 ? "is" : "are"
    } for one meeting; choose it.`;
  }
  if (req.meetingId && req.kind === "reflections") {
    return "Reflections cannot be limited to one meeting.";
  }
  const filters: ExportFilters = {
    from: req.from ? startOfDay(req.from) : undefined,
    to: req.to ? endOfDay(req.to) : undefined,
    meetingId: req.meetingId ?? undefined,
  };
  if (filters.from && filters.to && filters.from >= filters.to) {
    return "The first day must come before the last.";
  }
  return {
    req,
    formats,
    filters,
    name: { from: req.from ?? undefined, to: req.to ?? undefined },
  };
}

/**
 * Prepare one export for the officer: audit it, read it, build the files, and
 * say who was left out and why.
 *
 * ## Audit before read
 *
 * Every audit row is written before the first export row is read, the Bevy
 * file's survey answers included (the CLI reads those first; this does not).
 * If an audit row cannot be written the export stops there and nothing is
 * read: an export that cannot be attributed does not happen. The row count is
 * filled in once the files are built.
 *
 * One audit row per file, its format in the filters, as the CLI does. Making
 * the files here, before the officer clicks Download, still counts as the
 * export: the data has reached them.
 */
export async function prepareExport(
  input: unknown,
  actorUserId: string,
  deps: ExportDeps,
): Promise<ExportResponse> {
  const parsed = exportRequestSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "That request was invalid.");
  }
  const checked = check(parsed.data);
  if (typeof checked === "string") return fail(checked);
  const { req, formats, filters, name } = checked;

  const auditIds: string[] = [];
  try {
    for (const format of formats) {
      const recorded = auditFilters(filters);
      if (format !== "platform") recorded.format = format;
      auditIds.push(await deps.audit(actorUserId, req.kind, recorded));
    }
  } catch {
    return fail(
      "The export was not recorded in the audit log, so nothing was read. Try again.",
    );
  }

  let built: ReturnType<typeof buildExportFiles>;
  try {
    if (filters.meetingId) {
      const slug = await deps.meetingSlug(filters.meetingId);
      if (!slug) return fail("That meeting was not found.");
      name.meetingSlug = slug;
    }
    const rows = await deps.rows(req.kind, filters);
    const surveyRows =
      formats.includes("bevy") && filters.meetingId
        ? await deps.rows("responses", { meetingId: filters.meetingId })
        : undefined;
    built = buildExportFiles({
      kind: req.kind,
      formats,
      rows,
      surveyRows,
      name,
    });
  } catch (err) {
    if (err instanceof RangeError) return fail(err.message);
    return fail("The export failed. Nothing was downloaded; try again.");
  }

  try {
    await Promise.all(
      built.files.map((f, i) => deps.finish(auditIds[i]!, f.count)),
    );
  } catch {
    // The files are right; only the count on the audit row is missing.
  }

  const { files, leftOut } = built;
  const report =
    leftOut.length > 0
      ? { name: `${req.kind}-left-out.csv`, text: leftOutCsv(leftOut) }
      : null;

  let zip: { name: string; base64: string } | null = null;
  if (req.zip) {
    const archive = new JSZip();
    for (const f of files) archive.file(f.name, f.text);
    if (report) archive.file(report.name, report.text);
    zip = {
      name: zipFileName(req.kind, name),
      base64: await archive.generateAsync({
        type: "base64",
        compression: "DEFLATE",
      }),
    };
  }

  return {
    kind: "ready",
    files: files.map((f) => ({
      name: f.name,
      mime: f.mime,
      text: zip ? null : f.text,
      count: f.count,
      unit: f.unit,
      label: f.label,
    })),
    zip,
    leftOutTotal: leftOut.length,
    leftOut: leftOut.slice(0, MAX_LISTED_LEFT_OUT).map((l) => ({
      file: l.formatLabel,
      outcome: l.outcome,
      name: l.name,
      email: l.email,
      reason: l.reason,
    })),
    report,
  };
}
