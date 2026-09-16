const BUCKET_SECONDS = 30;
const TOKEN_VERSION = "v1";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AttendanceQrChallenge = {
  meetingId: string;
  bucket: number;
  token: string;
};

function bucketAt(at: Date): number {
  return Math.floor(at.getTime() / 1000 / BUCKET_SECONDS);
}

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

function message(
  kind: "qr" | "manual",
  meetingId: string,
  bucket: number,
): string {
  return `devdogs:attendance:${TOKEN_VERSION}:${kind}:${meetingId}:${bucket}`;
}

function isAcceptedBucket(bucket: number, at: Date): boolean {
  const current = bucketAt(at);
  return (
    Number.isSafeInteger(bucket) &&
    (bucket === current || bucket === current - 1)
  );
}

export async function createQrChallenge(
  secret: string,
  meetingId: string,
  at: Date = new Date(),
): Promise<AttendanceQrChallenge> {
  if (!UUID_PATTERN.test(meetingId))
    throw new Error("meetingId must be a UUID");
  const bucket = bucketAt(at);
  const signature = await hmac(secret, message("qr", meetingId, bucket));
  return { meetingId, bucket, token: bytesToBase64Url(signature) };
}

export async function verifyQrChallenge(
  secret: string,
  challenge: AttendanceQrChallenge,
  at: Date = new Date(),
): Promise<boolean> {
  if (!UUID_PATTERN.test(challenge.meetingId)) return false;
  if (!isAcceptedBucket(challenge.bucket, at)) return false;
  const supplied = base64UrlToBytes(challenge.token);
  if (supplied === null) return false;
  const expected = await hmac(
    secret,
    message("qr", challenge.meetingId, challenge.bucket),
  );
  return equalConstantTime(supplied, expected);
}

export async function createManualCode(
  secret: string,
  meetingId: string,
  at: Date = new Date(),
): Promise<string> {
  if (!UUID_PATTERN.test(meetingId))
    throw new Error("meetingId must be a UUID");
  const digest = await hmac(secret, message("manual", meetingId, bucketAt(at)));
  const value = new DataView(
    digest.buffer,
    digest.byteOffset,
    digest.byteLength,
  ).getUint32(0);
  return String(value % 1_000_000).padStart(6, "0");
}

export async function verifyManualCode(
  secret: string,
  meetingId: string,
  code: string,
  at: Date = new Date(),
): Promise<boolean> {
  if (!UUID_PATTERN.test(meetingId) || !/^\d{6}$/.test(code)) return false;
  const currentBucket = bucketAt(at);
  const candidates = await Promise.all(
    [currentBucket, currentBucket - 1].map(async (bucket) => {
      const digest = await hmac(secret, message("manual", meetingId, bucket));
      const value = new DataView(
        digest.buffer,
        digest.byteOffset,
        digest.byteLength,
      ).getUint32(0);
      return String(value % 1_000_000).padStart(6, "0");
    }),
  );
  const supplied = new TextEncoder().encode(code);
  let matches = 0;
  for (const candidate of candidates) {
    matches |= Number(
      equalConstantTime(supplied, new TextEncoder().encode(candidate)),
    );
  }
  return matches === 1;
}

export function attendanceQrUrl(
  baseUrl: string,
  challenge: AttendanceQrChallenge,
): string {
  const url = new URL("/attendance/claim", baseUrl);
  url.searchParams.set("meeting", challenge.meetingId);
  url.searchParams.set("bucket", String(challenge.bucket));
  url.searchParams.set("token", challenge.token);
  return url.toString();
}
