import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "~/env";
import { getAirtableClient } from "~/server/airtable/credentials";
import { processOfficerChange } from "~/server/airtable/processOfficerChange";

const MAX_BODY_BYTES = 1_024;
const requestSchema = z.object({
  recordId: z.string().regex(/^rec[A-Za-z0-9]{14}$/),
});

/**
 * Receives one Airtable automation delivery. The record id is only a pointer:
 * the platform reads the authoritative form response directly from Airtable,
 * then pins its normalized contents in an immutable database receipt.
 */
export async function POST(request: Request) {
  if (!(await hasValidBearer(request.headers.get("authorization")))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = await readBoundedBody(request);
  if (raw === null) {
    return NextResponse.json(
      { error: "Request body is too large." },
      { status: 413 },
    );
  }

  let input: z.infer<typeof requestSchema>;
  try {
    input = requestSchema.parse(JSON.parse(raw));
  } catch {
    return NextResponse.json(
      { error: "Expected an Airtable recordId." },
      { status: 400 },
    );
  }

  try {
    const client = await getAirtableClient();
    const result = await processOfficerChange(client, input.recordId);
    return NextResponse.json(result, {
      status: result.status === "rejected" ? 422 : 200,
    });
  } catch (error) {
    // Airtable response bodies and command payloads can contain member data.
    // Keep the log useful without serializing either one.
    console.error("[airtable] officer change delivery failed", {
      error: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json(
      { error: "The command could not be processed. Retry the automation." },
      { status: 503 },
    );
  }
}

async function hasValidBearer(value: string | null): Promise<boolean> {
  const expected = `Bearer ${env.AIRTABLE_AUTOMATION_SECRET}`;
  const [actualHash, expectedHash] = await Promise.all([
    sha256(value ?? ""),
    sha256(expected),
  ]);
  let difference = 0;
  for (let index = 0; index < expectedHash.length; index += 1) {
    difference |= actualHash[index]! ^ expectedHash[index]!;
  }
  return difference === 0;
}

async function sha256(value: string): Promise<Uint8Array> {
  const bytes = new TextEncoder().encode(value);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

async function readBoundedBody(request: Request): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}
