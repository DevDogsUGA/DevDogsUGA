const CLAIM_VERSION = "v1";
const CLAIM_MAX_AGE_SECONDS = 10 * 60;
const CLOCK_SKEW_SECONDS = 60;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PendingAttendanceClaim = {
  meetingId: string;
  method: "qr" | "manual_code";
  issuedAt: number;
};

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const padded = value.replaceAll("-", "+").replaceAll("_", "/");
  try {
    const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

async function hmac(secret: string, message: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(message)),
  );
}

function equalConstantTime(left: Uint8Array, right: Uint8Array): boolean {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

function payload(claim: PendingAttendanceClaim): string {
  return `${CLAIM_VERSION}:${claim.meetingId}:${claim.method}:${claim.issuedAt}`;
}

export async function createPendingAttendanceClaim(
  secret: string,
  meetingId: string,
  method: PendingAttendanceClaim["method"],
  at: Date = new Date(),
): Promise<string> {
  if (!UUID_PATTERN.test(meetingId)) {
    throw new Error("meetingId must be a UUID");
  }
  const claim = {
    meetingId,
    method,
    issuedAt: Math.floor(at.getTime() / 1000),
  };
  const body = payload(claim);
  return `${body}.${bytesToBase64Url(await hmac(secret, body))}`;
}

export async function verifyPendingAttendanceClaim(
  secret: string,
  value: string,
  at: Date = new Date(),
): Promise<PendingAttendanceClaim | null> {
  const parts = value.split(".");
  if (parts.length !== 2) return null;
  const [body, encodedSignature] = parts;
  if (!body || !encodedSignature) return null;

  const fields = body.split(":");
  if (fields.length !== 4) return null;
  const [version, meetingId, method, issuedAtText] = fields;
  const issuedAt = Number(issuedAtText);
  if (
    version !== CLAIM_VERSION ||
    !meetingId ||
    !UUID_PATTERN.test(meetingId) ||
    (method !== "qr" && method !== "manual_code") ||
    !Number.isSafeInteger(issuedAt)
  ) {
    return null;
  }

  const now = Math.floor(at.getTime() / 1000);
  if (
    issuedAt > now + CLOCK_SKEW_SECONDS ||
    now - issuedAt > CLAIM_MAX_AGE_SECONDS
  ) {
    return null;
  }

  const supplied = base64UrlToBytes(encodedSignature);
  if (!supplied) return null;
  const expected = await hmac(secret, body);
  if (!equalConstantTime(supplied, expected)) return null;

  return { meetingId, method, issuedAt };
}

export const PENDING_ATTENDANCE_COOKIE = "pending_attendance";
export const PENDING_ATTENDANCE_MAX_AGE = CLAIM_MAX_AGE_SECONDS;
