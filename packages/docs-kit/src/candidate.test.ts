import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  buildCandidate,
  summarizeChanges,
  verifyCandidate,
  type CandidateContent,
} from "./candidate.js";
import { DocsBuildError } from "./errors.js";
import { renderBody } from "./render.js";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHnOcQAAAAABJRU5ErkJggg==",
  "base64",
);
const SOURCE = {
  repository: "DevDogsUGA/demo",
  branch: "main",
  sha: "a".repeat(40),
  directory: "docs",
  destination: "/docs/demo",
};

let root: string;
let docs: string;

beforeAll(async () => {
  await renderBody("", {
    project: "demo",
    projects: ["demo"],
    os: ["macos", "linux", "wsl"],
    file: "warmup.md",
  });
}, 60_000);

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-kit-candidate-"));
  docs = path.join(root, "docs");
  fs.mkdirSync(path.join(docs, "img"), { recursive: true });
  fs.writeFileSync(
    path.join(docs, "index.md"),
    "# Demo\n\nSee the [guide](./guide.md#start).\n\n![logo](./img/logo.png)\n",
  );
  fs.writeFileSync(
    path.join(docs, "guide.md"),
    "# Guide\n\n## Start\n\ntext\n",
  );
  fs.writeFileSync(path.join(docs, "img", "logo.png"), PNG);
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const build = (live: CandidateContent | null = null, out = "out") =>
  buildCandidate({
    docsDir: docs,
    project: "demo",
    outDir: path.join(root, out),
    source: SOURCE,
    live,
  });

describe("buildCandidate", () => {
  it("writes content, review files and a verifiable manifest", async () => {
    const { manifest, checks } = await build();
    const out = path.join(root, "out");
    expect(checks.every((c) => c.ok)).toBe(true);
    expect(manifest.files.map((f) => f.path)).toEqual([
      "assets/img/logo.png",
      "content.json",
      "search.json",
    ]);
    expect(verifyCandidate(out).digest).toBe(manifest.digest);
    expect(verifyCandidate(out, manifest.digest).project).toBe("demo");
    const summary = fs.readFileSync(
      path.join(out, "review/summary.md"),
      "utf-8",
    );
    expect(summary).toContain("No live version yet");
    expect(summary).toContain(SOURCE.sha);
    // The preview is script-free, CSP-locked, and its links point at preview files.
    const index = fs.readFileSync(
      path.join(out, "review/preview/index.html"),
      "utf-8",
    );
    expect(index).toContain("Content-Security-Policy");
    expect(index).toContain('href="guide.html#pd-demo--start"');
    expect(fs.existsSync(path.join(out, "review/preview/img/logo.png"))).toBe(
      true,
    );
  });

  it("detects a swapped or added file", async () => {
    const { manifest } = await build();
    const out = path.join(root, "out");
    fs.appendFileSync(path.join(out, "content/search.json"), " ");
    expect(() => verifyCandidate(out)).toThrow(/manifest hash/);
    fs.writeFileSync(path.join(out, "content/extra.txt"), "x");
    expect(() => verifyCandidate(out)).toThrow(/don't match its manifest/);
    expect(() => verifyCandidate(out, "0".repeat(64))).toThrow();
    expect(manifest.digest).toHaveLength(64);
  });

  it("refuses a digest the build job didn't report", async () => {
    await build();
    expect(() =>
      verifyCandidate(path.join(root, "out"), "f".repeat(64)),
    ).toThrow(/isn't the one the build job reported/);
  });

  it("summarizes changes against the live version", async () => {
    await build();
    const live = JSON.parse(
      fs.readFileSync(path.join(root, "out/content/content.json"), "utf-8"),
    ) as CandidateContent;
    fs.writeFileSync(path.join(docs, "guide.md"), "# Guide\n\nchanged\n");
    fs.writeFileSync(path.join(docs, "new.md"), "# New\n");
    fs.rmSync(path.join(docs, "img", "logo.png"));
    fs.writeFileSync(
      path.join(docs, "index.md"),
      "# Demo\n\nSee the [guide](./guide.md).\n",
    );
    const { changes } = await build(live, "out2");
    expect(changes).toMatchObject({
      live: true,
      added: ["demo/new"],
      removed: [],
      assetsRemoved: ["img/logo.png"],
    });
    expect(changes.changed).toEqual(["demo/guide", "demo/index"]);
  });

  it("writes nothing for docs the compiler refuses", async () => {
    fs.writeFileSync(
      path.join(docs, "bad.md"),
      "# Bad\n\n<script>1</script>\n",
    );
    await expect(build()).rejects.toBeInstanceOf(DocsBuildError);
    expect(fs.existsSync(path.join(root, "out"))).toBe(false);
    expect(fs.existsSync(path.join(root, "out.partial"))).toBe(false);
  });

  it("won't overwrite an existing candidate", async () => {
    await build();
    await expect(build()).rejects.toThrow(/already exists/);
  });
});

describe("summarizeChanges", () => {
  it("treats no live version as everything new", () => {
    const next = {
      pages: [{ path: "a/x", htmlSha256: "1" }],
      assets: [],
    } as unknown as CandidateContent;
    expect(summarizeChanges(null, next)).toMatchObject({
      live: false,
      added: ["a/x"],
    });
  });
});

describe("digestOf", () => {
  it("matches the publish script's vector (.github/scripts/docs-publish.test.mjs)", async () => {
    const { digestOf } = await import("./candidate.js");
    expect(
      digestOf([
        { path: "b", sha256: "22", bytes: 0 },
        { path: "a", sha256: "11", bytes: 0 },
      ]),
    ).toBe("745156785586c2b23740617be576009888a8dcb9fdefe8af3bbb248488677e01");
  });
});
