import {
  guessHeaderRow,
  ImportInputError,
  MissingColumnsError,
} from "@devdogsuga/events/imports";
import type { ImportResponse } from "~/lib/imports";
import { MAX_UPLOAD_ROWS } from "~/lib/imports";
import {
  ATTENDANCE_FIELDS,
  analyzeAttendance,
  applyAttendance,
  type AttendancePlanned,
} from "./attendance";
import {
  analyzeRoster,
  applyRoster,
  ROSTER_FIELDS,
  type RosterPlanned,
} from "./roster";
import type { Analysis } from "./shared";
import type { ImportDeps, ImportRequest } from "./types";

type Analyzed =
  | { kind: "attendance"; analysis: Analysis<AttendancePlanned> }
  | { kind: "roster"; analysis: Analysis<RosterPlanned> };

async function analyze(
  req: ImportRequest,
  deps: ImportDeps,
): Promise<Analyzed> {
  if (req.text.split("\n").length > MAX_UPLOAD_ROWS) {
    throw new ImportInputError(
      `The file has more than ${MAX_UPLOAD_ROWS.toLocaleString("en-US")} rows. Split it and import the parts.`,
    );
  }
  return req.kind === "attendance"
    ? { kind: "attendance", analysis: await analyzeAttendance(req, deps) }
    : { kind: "roster", analysis: await analyzeRoster(req, deps) };
}

/**
 * Step one: read the upload and say what importing it would do. Writes
 * nothing, whatever the file holds (Q18).
 */
export async function previewImport(
  req: ImportRequest,
  deps: ImportDeps,
): Promise<ImportResponse> {
  try {
    const { analysis } = await analyze(req, deps);
    const { preview } = analysis;
    return { kind: "preview", preview };
  } catch (err) {
    return failure(req, err);
  }
}

/**
 * The file has no header the parser recognizes: hand back the columns it can
 * see so the officer can say which is which (Q18), rather than failing.
 */
function needsMapping(req: ImportRequest, message: string): ImportResponse {
  const fields = req.kind === "roster" ? ROSTER_FIELDS : ATTENDANCE_FIELDS;
  return {
    kind: "needs-mapping",
    preview: null,
    headers: guessHeaderRow(req.text),
    mappingFields: fields,
    mapping: Object.fromEntries(fields.map((f) => [f.key, null])),
    message,
  };
}

function failure(req: ImportRequest, err: unknown): ImportResponse {
  // Columns not picked yet: offer the picker. Once picked, a failure is the
  // picks' fault and is reported as an error.
  if (
    err instanceof MissingColumnsError &&
    Object.keys(req.mapping).length === 0
  ) {
    return needsMapping(req, err.message);
  }
  if (err instanceof ImportInputError) {
    return { kind: "error", message: err.message };
  }
  throw err;
}

/**
 * Step two: the officer confirmed. The file is read and planned again against
 * the data as it is now; if the outcome no longer matches what they were
 * shown, the fresh preview goes back instead of a write (Q78).
 */
export async function confirmImport(
  req: ImportRequest,
  confirmation: { fingerprint: string; skipInvalid: boolean },
  actorUserId: string,
  deps: ImportDeps,
): Promise<ImportResponse> {
  let analyzed: Analyzed;
  try {
    analyzed = await analyze(req, deps);
  } catch (err) {
    return failure(req, err);
  }
  const { preview } = analyzed.analysis;
  if (preview.fingerprint !== confirmation.fingerprint) {
    return {
      kind: "preview",
      preview,
      notice:
        "The data changed since you previewed this file, so the preview was refreshed. Review it and confirm again.",
    };
  }
  if (preview.blocked) return { kind: "error", message: preview.blocked };
  if (
    preview.invalid.length + preview.invalidMore > 0 &&
    !confirmation.skipInvalid
  ) {
    return {
      kind: "error",
      message: "Confirm that the invalid rows will be skipped.",
    };
  }
  const result =
    analyzed.kind === "attendance"
      ? await applyAttendance(req, analyzed.analysis, actorUserId, deps)
      : await applyRoster(req, analyzed.analysis, actorUserId, deps);
  return { kind: "result", result };
}
