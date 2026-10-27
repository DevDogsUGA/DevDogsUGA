import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  digestOf,
  liveUrls,
  publish,
  publishKeys,
  verifyCandidateDir,
} from "./docs-publish.mjs";

const SHA = "b".repeat(40);
const sha = (data) => createHash("sha256").update(data).digest("hex");

function candidate(extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), "docs-publish-"));
  const contents = {
    "content.json": '{"v":1}',
    "search.json": "[]",
    "assets/img/a.png": "png-bytes",
  };
  const files = Object.entries(contents).map(([path, data]) => {
    mkdirSync(join(dir, "content", ...path.split("/").slice(0, -1)), {
      recursive: true,
    });
    writeFileSync(join(dir, "content", path), data);
    return { path, sha256: sha(data), bytes: Buffer.byteLength(data) };
  });
  const manifest = {
    version: 1,
    project: "demo",
    source: {
      repository: "DevDogsUGA/demo",
      branch: "main",
      sha: SHA,
      directory: "docs",
      destination: "/docs/demo",
    },
    files,
    digest: digestOf(files),
    ...extra,
  };
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest));
  return { dir, manifest };
}
const expected = (manifest) => ({
  project: "demo",
  sha: SHA,
  digest: manifest.digest,
});

test("the digest matches the one docs-kit computes (shared vector)", () => {
  assert.equal(
    digestOf([
      { path: "b", sha256: "22" },
      { path: "a", sha256: "11" },
    ]),
    "745156785586c2b23740617be576009888a8dcb9fdefe8af3bbb248488677e01",
  );
});

test("a good candidate verifies", () => {
  const { dir, manifest } = candidate();
  try {
    assert.equal(
      verifyCandidateDir(dir, expected(manifest)).digest,
      manifest.digest,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a tampered, extra, wrong-project or wrong-digest candidate is refused", () => {
  const { dir, manifest } = candidate();
  try {
    assert.throws(
      () =>
        verifyCandidateDir(dir, { ...expected(manifest), project: "other" }),
      /not "other"/,
    );
    assert.throws(
      () =>
        verifyCandidateDir(dir, { ...expected(manifest), sha: "c".repeat(40) }),
      /commit/,
    );
    assert.throws(
      () =>
        verifyCandidateDir(dir, {
          ...expected(manifest),
          digest: "0".repeat(64),
        }),
      /build job reported/,
    );
    writeFileSync(join(dir, "content", "extra.txt"), "x");
    assert.throws(
      () => verifyCandidateDir(dir, expected(manifest)),
      /don't match its manifest/,
    );
    rmSync(join(dir, "content", "extra.txt"));
    writeFileSync(join(dir, "content", "search.json"), "[1]");
    assert.throws(
      () => verifyCandidateDir(dir, expected(manifest)),
      /search\.json doesn't match/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a manifest whose digest was edited to fit is refused", () => {
  const { dir, manifest } = candidate({ digest: "1".repeat(64) });
  try {
    assert.throws(
      () =>
        verifyCandidateDir(dir, {
          project: "demo",
          sha: SHA,
          digest: manifest.digest,
        }),
      /digest doesn't match its files/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("keys are content-addressed and the pointer goes last", () => {
  const { dir, manifest } = candidate();
  try {
    const keys = publishKeys(manifest).map((k) => k.key);
    assert.equal(keys.at(-1), "projects/demo/current.json");
    assert.ok(
      keys
        .slice(0, -1)
        .every((k) =>
          k.startsWith(`projects/demo/versions/${manifest.digest}/`),
        ),
    );
    assert.equal(keys.length, 4);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("publish uploads every file, then the pointer", () => {
  const { dir, manifest } = candidate();
  try {
    const calls = [];
    const result = publish(dir, expected(manifest), {
      bucket: "docs-bucket",
      endpoint: "https://example.r2.cloudflarestorage.com",
      run: (args) => (calls.push(args), 0),
      now: () => new Date("2026-10-24T00:00:00Z"),
    });
    assert.equal(calls.length, 4);
    assert.ok(calls.at(-1)[3].endsWith("/projects/demo/current.json"));
    assert.ok(
      calls.every((c) => c[3].startsWith("s3://docs-bucket/projects/demo/")),
    );
    assert.ok(calls.at(-1).includes("no-cache"));
    assert.equal(result.uploads.length, 4);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a failed upload stops before the pointer, so the last good version stays live", () => {
  const { dir, manifest } = candidate();
  try {
    const calls = [];
    assert.throws(
      () =>
        publish(dir, expected(manifest), {
          bucket: "b",
          endpoint: "https://e",
          run: (args) => (calls.push(args), calls.length === 2 ? 1 : 0),
        }),
      /previous version is still live/,
    );
    assert.ok(!calls.some((c) => c[3].endsWith("current.json")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a candidate that fails verification uploads nothing", () => {
  const { dir, manifest } = candidate();
  try {
    writeFileSync(join(dir, "content", "content.json"), "tampered");
    let called = false;
    assert.throws(() =>
      publish(dir, expected(manifest), {
        bucket: "b",
        endpoint: "e",
        run: () => ((called = true), 0),
      }),
    );
    assert.equal(called, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("live URLs sit under the public base", () => {
  assert.deepEqual(liveUrls("https://docs.example/", "demo", "d".repeat(64)), {
    pointer: "https://docs.example/projects/demo/current.json",
    content: `https://docs.example/projects/demo/versions/${"d".repeat(64)}/content.json`,
  });
});
