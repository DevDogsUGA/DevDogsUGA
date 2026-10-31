import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { checkDocsDirReadiness } from "./readiness-dir.js";
import { checkPreviewReadiness } from "./preview.js";
import { buildCandidate } from "./candidate.js";
import { renderBody } from "./render.js";
import type { TreeEntry } from "./untrusted-policy.js";

const enc = new TextEncoder();

/** A docs tree as the Worker sees one: paths to bytes. */
const tree = (files: Record<string, string | Uint8Array>) =>
  new Map(
    Object.entries(files).map(([path, value]) => [
      path,
      typeof value === "string" ? enc.encode(value) : value,
    ]),
  );

const GOOD = {
  "index.md": "# Demo\n\nStart with the [guide](./guide.md#first).\n",
  "guide.md": "# Guide\n\n## First\n\nSome text.\n",
};

const check = (files: Record<string, string | Uint8Array>) =>
  checkPreviewReadiness({ files: tree(files) }, { project: "demo" });

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
]);

describe("docs readiness", () => {
  it("passes a folder with an overview, valid pages and links that resolve", async () => {
    const result = await check({ ...GOOD, "img/logo.png": PNG });
    expect(result).toEqual({
      ready: true,
      problems: [],
      pages: 2,
      assets: 1,
    });
  });

  it("asks for the overview page", async () => {
    const result = await check({ "guide.md": GOOD["guide.md"] });
    expect(result.ready).toBe(false);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toMatchObject({ kind: "structure", file: null });
    expect(result.problems[0]!.message).toContain("add index.md");
  });

  it("refuses a name, file type or nesting projects may not use, before reading anything", async () => {
    const odd = await check({ ...GOOD, "Notes & Ideas.md": "# x\n" });
    expect(odd.problems[0]).toMatchObject({ kind: "structure" });
    expect(odd.problems[0]!.message).toContain("has a file name outside");

    const script = await check({ ...GOOD, "run.sh": "echo hi" });
    expect(script.problems[0]!.message).toContain(
      "file type that docs can't contain",
    );

    const deep = await check({ ...GOOD, "a/b/c/d/e/f/g/h.md": "# x\n" });
    expect(deep.problems[0]!.message).toContain("nested deeper than 6 folders");
  });

  it("refuses a symlink and a submodule in the tree listing", async () => {
    const entries: TreeEntry[] = [
      { path: "index.md", type: "file", size: 8 },
      { path: "leak.md", type: "symlink", size: 0 },
    ];
    const result = await checkPreviewReadiness(
      { entries, files: tree({ "index.md": "# Demo\n" }) },
      { project: "demo" },
    );
    expect(result.ready).toBe(false);
    expect(result.problems[0]!.message).toContain("leak.md: is a symlink");

    const sub = await checkPreviewReadiness(
      {
        entries: [{ path: "vendor", type: "submodule", size: 0 }],
        files: tree({}),
      },
      { project: "demo" },
    );
    expect(sub.problems[0]!.message).toContain("vendor: isn't a regular file");
  });

  it("holds the folder to the size and page limits", async () => {
    const result = await checkPreviewReadiness(
      { files: tree(GOOD) },
      { project: "demo", limits: { maxPages: 1 } },
    );
    expect(result.problems[0]!.message).toContain("limit of 1 pages");
  });

  it("names every file whose front matter is invalid, not just the first", async () => {
    const result = await check({
      ...GOOD,
      "a.md": "---\ntitle: nope\n---\n\n# A\n",
      "b.md": "---\nmount: [other]\n---\n\n# B\n",
    });
    expect(result.ready).toBe(false);
    const compile = result.problems.filter((p) => p.kind === "compile");
    expect(compile.map((p) => p.file)).toEqual(["a.md", "b.md"]);
    expect(compile[0]!.message).toContain('frontmatter key "title"');
    expect(compile[1]!.message).toContain('frontmatter key "mount"');
  });

  it("refuses a section the compiler does not know and a removed scheduled key", async () => {
    const section = await check({
      ...GOOD,
      "a.md": "---\nsection: nowhere\n---\n\n# A\n",
    });
    expect(section.problems[0]).toMatchObject({ kind: "compile" });
    expect(section.problems[0]!.message).toContain('invalid "section');

    const scheduled = await check({
      ...GOOD,
      "a.md": "---\nscheduled: 2026-10-05T18:00:00Z\n---\n\n# A\n",
    });
    expect(scheduled.problems[0]!.message).toContain(
      'frontmatter key "scheduled"',
    );
  });

  it("refuses what the compiler blocks: scripts, styles, classes, forms, external images", async () => {
    const blocked: Record<string, string> = {
      script: "# S\n\n<script>alert(1)</script>\n",
      style: "# S\n\n<style>body{display:none}</style>\n",
      klass: '# S\n\n<div class="x">hi</div>\n',
      form: '# S\n\n<form action="/x"><input></form>\n',
      external: "# S\n\n![x](https://example.com/x.png)\n",
      handler: '# S\n\n<img src="./logo.png" onerror="x()">\n',
      jsLink: '# S\n\n<a href="javascript:alert(1)">x</a>\n',
    };
    for (const [name, body] of Object.entries(blocked)) {
      const result = await check({
        ...GOOD,
        "img/logo.png": PNG,
        "bad.md": body,
      });
      expect(result.ready, name).toBe(false);
      const problem = result.problems.find((p) => p.file === "bad.md");
      expect(problem, name).toMatchObject({ kind: "compile" });
    }
  });

  it("refuses an image whose bytes are not an image and a hostile SVG", async () => {
    const fake = await check({
      ...GOOD,
      "img/x.png": "<html>not a png</html>",
    });
    expect(fake.problems[0]!.message).toContain("isn't really a png image");

    const svg = await check({
      ...GOOD,
      "img/x.svg":
        '<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>',
    });
    expect(svg.ready).toBe(false);
    expect(svg.problems[0]).toMatchObject({
      kind: "compile",
      file: "img/x.svg",
    });
  });

  it("reports a link to a page that is not there, and to a missing heading", async () => {
    const result = await check({
      "index.md":
        "# Demo\n\n[gone](./missing.md) and [bad anchor](./guide.md#nope).\n",
      "guide.md": GOOD["guide.md"],
    });
    expect(result.ready).toBe(false);
    const links = result.problems.filter((p) => p.kind === "link");
    expect(links).toHaveLength(2);
    expect(links.map((p) => p.file)).toEqual(["index.md:3", "index.md:3"]);
    expect(links[0]!.message).toContain("missing.md");
  });

  it("is not fooled by a link written in a code block", async () => {
    const result = await check({
      ...GOOD,
      "a.md": "# A\n\n```md\n[gone](./missing.md)\n```\n",
    });
    expect(result.ready).toBe(true);
  });

  it("needs a title and some text on every page", async () => {
    const result = await check({
      ...GOOD,
      "empty.md": "---\nname: x\n---\n\n![](./img/logo.png)\n",
      "img/logo.png": PNG,
    });
    expect(result.problems).toEqual([
      expect.objectContaining({ kind: "structure", file: "empty.md" }),
    ]);
  });

  it("says so when a listed file has no contents", async () => {
    const result = await checkPreviewReadiness(
      {
        entries: [{ path: "index.md", type: "file", size: 3 }],
        files: tree({}),
      },
      { project: "demo" },
    );
    expect(result.problems[0]!.message).toContain("contents are missing");
  });
});

describe("one set of rules", () => {
  let root = "";
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
  beforeAll(async () => {
    await renderBody("", {
      project: "demo",
      projects: ["demo"],
      os: ["macos", "linux", "wsl"],
      file: "warmup.md",
    });
  }, 60_000);

  const write = (files: Record<string, string | Uint8Array>) => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-readiness-"));
    const docs = path.join(root, "docs");
    for (const [rel, data] of Object.entries(files)) {
      const target = path.join(docs, ...rel.split("/"));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, data);
    }
    return docs;
  };

  const FILES = {
    ...GOOD,
    "img/logo.png": PNG,
    "tab.md":
      "# Tabs\n\n```ts file=a.ts lines=1-2\nconst a = 1;\nconst b = 2;\n```\n",
  };

  it("answers the same for a folder on disk with Shiki as for the same files in memory without", async () => {
    const docs = write(FILES);
    const disk = await checkDocsDirReadiness(docs, { project: "demo" });
    const memory = await check(FILES);
    expect(disk).toEqual(memory);
    expect(disk.ready).toBe(true);
  }, 60_000);

  it("refuses the same fence, for the same reason, with and without the highlighter", async () => {
    const bad = {
      ...GOOD,
      "bad.md": "# Bad\n\n```ts lines=1-9\nconst a = 1;\n```\n",
    };
    const disk = await checkDocsDirReadiness(write(bad), { project: "demo" });
    const memory = await check(bad);
    expect(memory.ready).toBe(false);
    expect(memory.problems).toEqual(disk.problems);
    expect(memory.problems[0]!.message).toContain(
      "names 9 line(s) for a block of 1",
    );
  }, 60_000);

  it("is the answer the candidate pipeline gives: a broken link fails its check", async () => {
    const files = {
      "index.md": "# Demo\n\n[gone](./missing.md)\n",
    };
    const docs = write(files);
    const { checks } = await buildCandidate({
      docsDir: docs,
      project: "demo",
      outDir: path.join(root, "out"),
      source: {
        repository: "o/r",
        branch: "main",
        sha: "a".repeat(40),
        directory: "docs",
        destination: "/docs/demo",
      },
    });
    const readiness = await checkDocsDirReadiness(docs, { project: "demo" });
    expect(readiness.problems.map((p) => p.kind)).toEqual(["link"]);
    expect(
      checks.find((c) => c.name === "internal links resolve"),
    ).toMatchObject({
      ok: false,
    });
    expect(checks.filter((c) => !c.ok)).toHaveLength(1);
  }, 60_000);

  it("reports a refused directory (a symlink) as a structure problem", async () => {
    const docs = write(GOOD);
    fs.symlinkSync(path.join(docs, "index.md"), path.join(docs, "leak.md"));
    const result = await checkDocsDirReadiness(docs);
    expect(result.ready).toBe(false);
    expect(result.problems[0]).toMatchObject({ kind: "structure" });
    expect(result.problems[0]!.message).toContain("leak.md: is a symlink");
  });
});
