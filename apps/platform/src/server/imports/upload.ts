import { z } from "zod";
import { MAX_UPLOAD_BYTES } from "~/lib/imports";
import type { ImportRequest } from "./types";

/** Room above the file for the other form fields and multipart framing. */
const FORM_OVERHEAD = 64 * 1024;

export type UploadResult =
  | {
      ok: true;
      request: ImportRequest;
      /** Present on a confirm. */
      confirmation: { fingerprint: string; skipInvalid: boolean } | null;
    }
  | { ok: false; status: number; message: string };

const fields = z.object({
  kind: z.enum(["attendance", "roster"]),
  mode: z.enum(["add", "replace"]),
  meetingId: z.string().uuid().nullable(),
  mapping: z.record(z.string(), z.string().max(300)),
  fingerprint: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .nullable(),
  skipInvalid: z.boolean(),
});

function text(form: FormData, name: string): string | null {
  const v = form.get(name);
  return typeof v === "string" && v !== "" ? v : null;
}

function tooLarge(): UploadResult {
  return {
    ok: false,
    status: 413,
    message: `That file is over the ${MAX_UPLOAD_BYTES / 1_000_000} MB limit. Export only the columns and rows you need and try again.`,
  };
}

/**
 * Reads an import form and holds the line on size (Q77): the declared length
 * is checked before the body is read, and the file's own size after, so a
 * sender that lies about one is caught by the other.
 */
export async function readUpload(request: Request): Promise<UploadResult> {
  const declared = Number(request.headers.get("content-length"));
  if (!Number.isFinite(declared) || declared <= 0) {
    return {
      ok: false,
      status: 411,
      message: "The upload did not say how large it is.",
    };
  }
  if (declared > MAX_UPLOAD_BYTES + FORM_OVERHEAD) return tooLarge();

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return { ok: false, status: 400, message: "That upload was not valid." };
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, status: 400, message: "Choose a CSV file." };
  }
  if (file.size > MAX_UPLOAD_BYTES) return tooLarge();
  if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") {
    return {
      ok: false,
      status: 415,
      message: "Only CSV files can be imported. Save the sheet as CSV first.",
    };
  }

  let mapping: unknown = {};
  const rawMapping = text(form, "mapping");
  if (rawMapping) {
    try {
      mapping = JSON.parse(rawMapping);
    } catch {
      return { ok: false, status: 400, message: "That upload was not valid." };
    }
  }
  const parsed = fields.safeParse({
    kind: text(form, "kind"),
    mode: text(form, "mode") ?? "add",
    meetingId: text(form, "meetingId"),
    mapping,
    fingerprint: text(form, "fingerprint"),
    skipInvalid: text(form, "skipInvalid") === "true",
  });
  if (!parsed.success) {
    return { ok: false, status: 400, message: "That upload was not valid." };
  }
  const v = parsed.data;

  return {
    ok: true,
    request: {
      kind: v.kind,
      mode: v.mode,
      fileName: file.name,
      text: await file.text(),
      mapping: v.mapping,
      meetingId: v.meetingId,
    },
    confirmation: v.fingerprint
      ? { fingerprint: v.fingerprint, skipInvalid: v.skipInvalid }
      : null,
  };
}
