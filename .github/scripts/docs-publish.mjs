/**
 * The publish half of the docs pipeline: verifies a candidate directory
 * against its manifest and uploads exactly its `content/` to the docs content
 * bucket. No dependencies and no install: the publish job runs this with only
 * the publisher credential in its environment, after reviewers approved.
 *
 * Bucket layout (what the site will read; the reader is not part of this):
 *   projects/<project>/versions/<digest>/<file>   immutable, one per candidate
 *   projects/<project>/current.json               the pointer, written last
 *
 * Writing the pointer last is the whole switch. A run that fails before it
 * leaves the previous pointer, and so the last good version, live; the new
 * version's files are just unreferenced objects. Re-running a publish is safe
 * because a version's key is its content digest.
 *
 * Usage:
 *   node docs-publish.mjs publish <candidateDir> --project P --sha S --digest D
 *   node docs-publish.mjs fetch-live <outFile> --project P
 * `publish` needs DOCS_BUCKET and DOCS_ENDPOINT (and AWS_* credentials for the
 * `aws` CLI); `fetch-live` needs DOCS_LIVE_BASE_URL (public, no credential).
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { isMain } from "./is-main.mjs";

const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const SHA = /^[0-9a-f]{40}$/;

const sha256 = (data) => createHash("sha256").update(data).digest("hex");

/** Must stay byte-for-byte what `digestOf` in packages/docs-kit/src/candidate.ts computes. */
export function digestOf(files) {
  return sha256(
    [...files]
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
      .map((f) => `${f.path}:${f.sha256}`)
      .join("\n"),
  );
}

function listFiles(dir, rel = "") {
  const out = [];
  for (const entry of readdirSync(join(dir, rel), { withFileTypes: true })) {
    const child = rel === "" ? entry.name : `${rel}/${entry.name}`;
    if (entry.isSymbolicLink()) throw new Error(`${child} is a symlink`);
    if (entry.isDirectory()) out.push(...listFiles(dir, child));
    else if (entry.isFile()) out.push(child);
    else throw new Error(`${child} isn't a regular file`);
  }
  return out.sort();
}

/**
 * Reads and verifies a candidate directory. Throws on any mismatch: a file
 * that isn't listed, a listed one that is missing or changed, a wrong digest,
 * or a project, commit or digest other than the ones the run was approved for.
 */
export function verifyCandidateDir(dir, expected) {
  const manifest = JSON.parse(
    readFileSync(join(dir, "manifest.json"), "utf-8"),
  );
  if (manifest.version !== 1) throw new Error("unknown candidate version");
  if (!SLUG.test(manifest.project ?? ""))
    throw new Error("manifest project isn't a slug");
  if (manifest.project !== expected.project)
    throw new Error(
      `the candidate is for "${manifest.project}", not "${expected.project}"`,
    );
  if (manifest.source?.sha !== expected.sha)
    throw new Error(
      `the candidate is for commit ${manifest.source?.sha}, not ${expected.sha}`,
    );
  if (!HEX64.test(manifest.digest ?? ""))
    throw new Error("manifest digest is malformed");
  if (manifest.digest !== expected.digest)
    throw new Error(
      `the candidate's digest ${manifest.digest} isn't the one the build job reported (${expected.digest})`,
    );

  const onDisk = listFiles(join(dir, "content"));
  const listed = manifest.files.map((f) => f.path).sort();
  if (JSON.stringify(onDisk) !== JSON.stringify(listed))
    throw new Error("the candidate's files don't match its manifest");
  for (const file of manifest.files) {
    if (file.path.split("/").some((s) => s === ".." || s === "." || s === ""))
      throw new Error(`unsafe path ${file.path}`);
    const bytes = readFileSync(join(dir, "content", file.path));
    if (sha256(bytes) !== file.sha256 || bytes.length !== file.bytes)
      throw new Error(`${file.path} doesn't match its manifest hash`);
  }
  if (digestOf(manifest.files) !== manifest.digest)
    throw new Error("manifest digest doesn't match its files");
  return manifest;
}

/** The object keys a publish writes, in upload order; the pointer is last. */
export function publishKeys(manifest) {
  const prefix = `projects/${manifest.project}/versions/${manifest.digest}`;
  return [
    ...manifest.files.map((f) => ({
      key: `${prefix}/${f.path}`,
      file: `content/${f.path}`,
    })),
    { key: `projects/${manifest.project}/current.json`, file: null },
  ];
}

export function pointerOf(manifest, publishedAt) {
  return {
    version: 1,
    project: manifest.project,
    digest: manifest.digest,
    sha: manifest.source.sha,
    repository: manifest.source.repository,
    destination: manifest.source.destination,
    publishedAt,
  };
}

const CONTENT_TYPES = {
  json: "application/json",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
};

/**
 * Uploads a verified candidate. `run(args)` runs the `aws` CLI and returns its
 * exit status; tests pass a fake. Stops at the first failure, before the
 * pointer.
 */
export function publish(
  dir,
  expected,
  { bucket, endpoint, run, now = () => new Date() },
) {
  const manifest = verifyCandidateDir(dir, expected);
  const uploads = [];
  for (const { key, file } of publishKeys(manifest)) {
    const source = file === null ? join(dir, "pointer.json") : join(dir, file);
    if (file === null)
      writeFileSync(
        source,
        JSON.stringify(pointerOf(manifest, now().toISOString()), null, 2) +
          "\n",
      );
    const ext = key.split(".").pop() ?? "";
    const args = [
      "s3",
      "cp",
      source,
      `s3://${bucket}/${key}`,
      "--endpoint-url",
      endpoint,
      "--only-show-errors",
      "--content-type",
      CONTENT_TYPES[ext] ?? "application/octet-stream",
    ];
    // The pointer must never be served stale; versions never change.
    args.push(
      "--cache-control",
      file === null ? "no-cache" : "public, max-age=31536000, immutable",
    );
    const status = run(args);
    if (status !== 0)
      throw new Error(
        `uploading ${key} failed (exit ${status}); the previous version is still live`,
      );
    uploads.push(key);
  }
  return { manifest, uploads };
}

/** Where the live version's pointer and content.json are, under the public base URL. */
export function liveUrls(base, project, digest) {
  const root = base.replace(/\/+$/, "");
  return {
    pointer: `${root}/projects/${project}/current.json`,
    content: digest
      ? `${root}/projects/${project}/versions/${digest}/content.json`
      : null,
  };
}

async function fetchLive(outFile, project) {
  const base = process.env.DOCS_LIVE_BASE_URL;
  if (!base || !SLUG.test(project)) {
    console.log(
      "No live docs location is configured; the change summary treats this as a first publication.",
    );
    return;
  }
  const { pointer } = liveUrls(base, project);
  const pointerResponse = await fetch(pointer);
  if (pointerResponse.status === 404) {
    console.log(`No live version of ${project} yet.`);
    return;
  }
  if (!pointerResponse.ok)
    throw new Error(`GET ${pointer} failed: ${pointerResponse.status}`);
  const live = await pointerResponse.json();
  if (!HEX64.test(live?.digest ?? ""))
    throw new Error("the live pointer has no valid digest");
  const { content } = liveUrls(base, project, live.digest);
  const contentResponse = await fetch(content);
  if (!contentResponse.ok)
    throw new Error(`GET ${content} failed: ${contentResponse.status}`);
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, await contentResponse.text());
  console.log(
    `Live version ${live.digest} (commit ${live.sha}) saved for the change summary.`,
  );
}

function flags(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i]?.startsWith("--") || argv[i + 1] === undefined)
      throw new Error(`bad arguments near "${argv[i] ?? ""}"`);
    out[argv[i].slice(2)] = argv[i + 1];
  }
  return out;
}

async function main() {
  const [command, target, ...rest] = process.argv.slice(2);
  try {
    const f = flags(rest);
    if (command === "fetch-live") return await fetchLive(target, f.project);
    if (command !== "publish")
      throw new Error("usage: docs-publish.mjs publish|fetch-live …");
    if (!SHA.test(f.sha ?? ""))
      throw new Error("--sha must be a full commit id");
    const { DOCS_BUCKET: bucket, DOCS_ENDPOINT: endpoint } = process.env;
    if (!bucket || !endpoint)
      throw new Error("DOCS_BUCKET and DOCS_ENDPOINT must be set");
    const { manifest, uploads } = publish(
      target,
      { project: f.project, sha: f.sha, digest: f.digest },
      {
        bucket,
        endpoint,
        run: (args) => spawnSync("aws", args, { stdio: "inherit" }).status ?? 1,
      },
    );
    console.log(
      `Published ${manifest.project} ${manifest.digest} (${uploads.length} objects, pointer last).`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (isMain(import.meta.url)) await main();
