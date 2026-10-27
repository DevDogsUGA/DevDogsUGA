/**
 * `backstage deploy avatars`: the seeded headshots, uploaded where missing.
 *
 * `supabase db push --include-seed` runs the seed SQL but never touches
 * Storage, so a new officer's profile reached a hosted tier without their
 * photo. `supabase seed buckets` would upload it, but it sends every file with
 * `x-upsert: true`, and the app stores an officer's own upload at the same key
 * (`avatars/<user id>`, also upserted). Run on every deploy, it would put the
 * seed photo back over whatever the officer chose since.
 *
 * So this uploads each file under a bucket's `objects_path` WITHOUT upsert,
 * and Storage's duplicate refusal is the "already there" answer. That makes it
 * insert-only, like the seed SQL beside it: a photo is added once and never
 * replaced, and there is no check-then-write race to lose.
 *
 * Reads `API_URL` (else `https://<PROJECT_REF>.supabase.co`) and `SECRET_KEY`
 * from the step's own `env:`, like the other credential-holding steps.
 */
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { nonEmpty } from "@devdogsuga/cli-core/db/connection";
import { resolveLayout } from "@devdogsuga/cli-core/repo/layout";
import { DeployError, say } from "./report.js";

export interface SeededBucket {
  bucket: string;
  /** Absolute directory of the bucket's `objects_path`. */
  dir: string;
}

/**
 * Every `[storage.buckets.<name>]` in `supabase/config.toml` that declares an
 * `objects_path`. A line scan rather than a TOML parser: the two keys are
 * flat, quoted and always written this way by the Supabase template, and a
 * table header ends the previous section.
 */
export function seededBuckets(configToml: string, supabaseDir: string) {
  const found: SeededBucket[] = [];
  let bucket: string | undefined;
  for (const line of configToml.split("\n")) {
    const header = /^\s*\[([^\]]+)\]\s*$/.exec(line);
    if (header) {
      const m = /^storage\.buckets\.([A-Za-z0-9_-]+)$/.exec(header[1]!.trim());
      bucket = m?.[1];
      continue;
    }
    const path = /^\s*objects_path\s*=\s*"([^"]+)"/.exec(line);
    if (bucket && path) {
      found.push({ bucket, dir: resolve(supabaseDir, path[1]!) });
    }
  }
  return found;
}

/**
 * Every file under `dir` as its path relative to it (`/` separated), sorted.
 * A folder is part of an object's key: `apps/dogdays.webp` under the bucket's
 * `objects_path` is uploaded as the key `apps/dogdays.webp`, which is how the
 * DogDays and DogPack icons land where an app's `logoPath` says (the consent
 * screen reads `apps/<name>.webp` in the public avatars bucket).
 */
export async function objectNames(dir: string, prefix = ""): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(join(dir, prefix), {
    withFileTypes: true,
  })) {
    if (entry.name.startsWith(".")) continue;
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) found.push(...(await objectNames(dir, name)));
    else if (entry.isFile()) found.push(name);
  }
  return found.sort();
}

/** The content type Storage needs, from the bytes; the seeds have no extension. */
export function sniffImageType(bytes: Uint8Array): string | undefined {
  const ascii = (from: number, to: number) =>
    String.fromCharCode(...bytes.subarray(from, to));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (bytes[0] === 0x89 && ascii(1, 4) === "PNG") return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  return undefined;
}

export type UploadResult = "uploaded" | "exists";

/**
 * POST without `x-upsert`. Storage refuses a duplicate key with 409, or (older
 * Storage) a 400 whose body says `"statusCode":"409"` / `"Duplicate"`.
 */
export async function uploadIfMissing(
  apiUrl: string,
  secretKey: string,
  bucket: string,
  name: string,
  bytes: Uint8Array,
  contentType: string,
  fetchImpl: typeof fetch = fetch,
): Promise<UploadResult> {
  const url = `${apiUrl.replace(/\/+$/, "")}/storage/v1/object/${encodeURIComponent(bucket)}/${name.split("/").map(encodeURIComponent).join("/")}`;
  const res = await fetchImpl(url, {
    method: "POST",
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": contentType,
      "x-upsert": "false",
    },
    body: bytes,
  });
  if (res.ok) return "uploaded";
  const body = await res.text().catch(() => "");
  if (res.status === 409 || /"statusCode"\s*:\s*"409"|Duplicate/i.test(body)) {
    return "exists";
  }
  throw new DeployError(
    `Uploading ${bucket}/${name} failed (HTTP ${res.status}).`,
    [body.slice(0, 300) || "Storage gave no reason."],
  );
}

export interface AvatarsDeps {
  root?: string;
  fetch?: typeof fetch;
}

export async function runDeployAvatars(
  env: NodeJS.ProcessEnv = process.env,
  deps: AvatarsDeps = {},
): Promise<void> {
  // nonEmpty, not `??`: an unset GitHub variable arrives as "", not undefined.
  const ref = nonEmpty(env.PROJECT_REF);
  const apiUrl =
    nonEmpty(env.API_URL) ?? (ref ? `https://${ref}.supabase.co` : undefined);
  const secretKey = nonEmpty(env.SECRET_KEY);
  if (!apiUrl || !secretKey) {
    throw new DeployError(
      `${apiUrl ? "SECRET_KEY" : "API_URL (or PROJECT_REF)"} is not set — refusing to upload.`,
      [
        "This step reads the Storage endpoint and the tier's secret key from",
        "its own env: block. An empty value usually means the workflow step",
        "lost it, or the environment never had it.",
      ],
    );
  }

  const supabaseDir = join(
    deps.root ?? resolveLayout().devdogsugaRoot,
    "supabase",
  );
  const config = await readFile(join(supabaseDir, "config.toml"), "utf8");
  let uploaded = 0;
  let existing = 0;
  for (const { bucket, dir } of seededBuckets(config, supabaseDir)) {
    const names = await objectNames(dir);
    for (const name of names) {
      const bytes = new Uint8Array(await readFile(join(dir, name)));
      const type = sniffImageType(bytes);
      if (!type) {
        throw new DeployError(`${bucket}/${name} is not a WebP, PNG or JPEG.`);
      }
      const result = await uploadIfMissing(
        apiUrl,
        secretKey,
        bucket,
        name,
        bytes,
        type,
        deps.fetch,
      );
      if (result === "uploaded") {
        uploaded++;
        say([`deploy avatars: uploaded ${bucket}/${name}`]);
      } else {
        existing++;
      }
    }
  }
  say([
    `deploy avatars: ${uploaded} uploaded, ${existing} already there (left alone).`,
  ]);
}
