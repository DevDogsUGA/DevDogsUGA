import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { compileDocs, renderPages } from "./compile.js";
import { renderBody } from "./render.js";
import { DocsBuildError } from "./errors.js";
import { compileUntrustedDocs, MANIFEST_FILE } from "./untrusted.js";

// 1x1 PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHnOcQAAAAABJRU5ErkJggg==",
  "base64",
);

let root: string;
let docs: string;

// The first render loads Shiki's highlighter, which alone can outlast
// vitest's 5s per-test timeout on a cold CI runner (as in codeblocks.test.ts).
beforeAll(async () => {
  await renderBody("", {
    project: "demo",
    projects: ["demo"],
    os: ["macos", "linux", "wsl"],
    file: "warmup.md",
  });
}, 60_000);

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-kit-untrusted-"));
  docs = path.join(root, "docs");
  fs.mkdirSync(docs);
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

function write(rel: string, content: string | Buffer): void {
  const target = path.join(docs, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

const compile = (limits = {}) =>
  compileUntrustedDocs(docs, { project: "demo", limits });

describe("compileUntrustedDocs", () => {
  it("compiles markdown, a manifest and approved assets", async () => {
    write(
      "index.md",
      "# Demo\n\n![logo](./img/logo.png) [guide](./guides/a.md)\n",
    );
    write("guides/a.md", "# A\n\n[ext](https://example.com)\n");
    write("img/logo.png", PNG);
    write(
      "img/mark.svg",
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"><circle cx="1" cy="1" r="1"/></svg>',
    );
    write(MANIFEST_FILE, JSON.stringify({ version: 1, name: "Demo project" }));

    const result = await compile();
    expect(result.project.name).toBe("Demo project");
    expect(result.pages.map((p) => p.path).sort()).toEqual([
      "demo/guides/a",
      "demo/index",
    ]);
    expect(result.assets.map((a) => a.path)).toEqual([
      "img/logo.png",
      "img/mark.svg",
    ]);
    expect(
      result.pages.find((p) => p.path === "demo/guides/a")!.html,
    ).toContain('rel="noopener noreferrer nofollow"');
  });

  it("leaves no staging directory behind", async () => {
    write("index.md", "# Demo\n");
    const before = fs
      .readdirSync(os.tmpdir())
      .filter((n) => n.startsWith("docs-untrusted-"));
    await compile();
    const after = fs
      .readdirSync(os.tmpdir())
      .filter((n) => n.startsWith("docs-untrusted-"));
    expect(after.length).toBeLessThanOrEqual(before.length);
  });

  it("rejects a symlinked file, naming it", async () => {
    write("index.md", "# Demo\n");
    fs.writeFileSync(path.join(root, "secret.md"), "# secret\n");
    fs.symlinkSync(path.join(root, "secret.md"), path.join(docs, "leak.md"));
    await expect(compile()).rejects.toThrow(/leak\.md: is a symlink/);
  });

  it("rejects a symlinked directory", async () => {
    write("index.md", "# Demo\n");
    fs.mkdirSync(path.join(root, "outside"));
    fs.writeFileSync(path.join(root, "outside", "x.md"), "# x\n");
    fs.symlinkSync(path.join(root, "outside"), path.join(docs, "linked"));
    await expect(compile()).rejects.toThrow(/linked: is a symlink/);
  });

  it("rejects a symlinked docs directory", async () => {
    write("index.md", "# Demo\n");
    const link = path.join(root, "link");
    fs.symlinkSync(docs, link);
    await expect(
      compileUntrustedDocs(link, { project: "demo" }),
    ).rejects.toThrow(/symlink/);
  });

  it("rejects a dangling symlink", async () => {
    write("index.md", "# Demo\n");
    fs.symlinkSync("/nonexistent/target", path.join(docs, "dangling.png"));
    await expect(compile()).rejects.toThrow(/symlink/);
  });

  it.each([
    ["a script", "run.sh", "echo hi"],
    ["a JavaScript file", "plugin.js", "export default 1"],
    ["a config file", "package.json", "{}"],
    ["an HTML file", "page.html", "<script>1</script>"],
    ["a dotfile", ".env", "SECRET=1"],
    ["a name with a space", "my page.md", "# x"],
    ["a name starting with a dash", "-rf.md", "# x"],
  ])("rejects %s", async (_label, name, content) => {
    write("index.md", "# Demo\n");
    write(name, content);
    await expect(compile()).rejects.toThrow(DocsBuildError);
  });

  it("rejects the reserved _shared folder", async () => {
    write("index.md", "# Demo\n");
    write("_shared/x.md", "---\nmount: [demo]\n---\n# x\n");
    await expect(compile()).rejects.toThrow(/_shared/);
  });

  it("rejects an oversized markdown file", async () => {
    write("index.md", "# Demo\n" + "a".repeat(2000));
    await expect(compile({ maxMarkdownBytes: 1000 })).rejects.toThrow(
      /over the 1000-byte limit/,
    );
  });

  it("rejects an oversized asset", async () => {
    write("index.md", "# Demo\n");
    write("big.png", Buffer.concat([PNG, Buffer.alloc(5000)]));
    await expect(compile({ maxAssetBytes: 1000 })).rejects.toThrow(
      /big\.png: is \d+ bytes/,
    );
  });

  it("rejects too many files and too much in total", async () => {
    write("index.md", "# Demo\n");
    for (let i = 0; i < 5; i++) write(`p${i}.md`, `# ${i}\n`);
    await expect(compile({ maxFiles: 3 })).rejects.toThrow(/limit of 3 files/);
    await expect(compile({ maxPages: 2 })).rejects.toThrow(/limit of 2 pages/);
    await expect(compile({ maxTotalBytes: 20 })).rejects.toThrow(/total limit/);
  });

  it("rejects folders nested too deep", async () => {
    write("index.md", "# Demo\n");
    write("a/b/c/d.md", "# d\n");
    await expect(compile({ maxDepth: 2 })).rejects.toThrow(/deeper than 2/);
  });

  it("rejects an image whose bytes are not an image", async () => {
    write("index.md", "# Demo\n");
    write("evil.png", "<html><script>1</script></html>");
    await expect(compile()).rejects.toThrow(/isn't really a png/);
  });

  it("rejects an SVG asset with script", async () => {
    write("index.md", "# Demo\n");
    write(
      "evil.svg",
      '<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>',
    );
    await expect(compile()).rejects.toThrow(/evil\.svg:.*script/);
  });

  it("rejects an image reference outside the docs directory", async () => {
    write("index.md", "# Demo\n\n![x](../outside.png)\n");
    fs.writeFileSync(path.join(root, "outside.png"), PNG);
    await expect(compile()).rejects.toThrow(/climbs out of the docs directory/);
  });

  it("rejects hostile markup in a page, with file and line", async () => {
    write("index.md", "# Demo\n");
    write("guides/a.md", "# A\n\nfine\n\n<iframe src=x></iframe>\n");
    await expect(compile()).rejects.toThrow(
      /demo\/guides\/a\.md:5 \(in demo\): `<iframe>`/,
    );
  });

  describe("no config, no code", () => {
    it("refuses JavaScript frontmatter instead of evaluating it", async () => {
      const marker = path.join(root, "pwned");
      write(
        "index.md",
        `---js\n{ x: require("fs").writeFileSync(${JSON.stringify(marker)}, "1") }\n---\n# Demo\n`,
      );
      await expect(compile()).rejects.toThrow(/JavaScript/);
      expect(fs.existsSync(marker)).toBe(false);
    });

    it("refuses frontmatter keys that steer the build", async () => {
      write("index.md", "# Demo\n");
      write("a.md", "---\nmount: [platform]\n---\n# a\n");
      await expect(compile()).rejects.toThrow(/key "mount"/);
    });

    it("refuses an unknown manifest key and a bad version", async () => {
      write("index.md", "# Demo\n");
      write(MANIFEST_FILE, JSON.stringify({ version: 1, plugins: ["x"] }));
      await expect(compile()).rejects.toThrow(/unknown key "plugins"/);
      write(MANIFEST_FILE, JSON.stringify({ version: 2 }));
      await expect(compile()).rejects.toThrow(/"version" must be 1/);
    });

    it("ignores a manifest anywhere but the top", async () => {
      write("index.md", "# Demo\n");
      write(`sub/${MANIFEST_FILE}`, "{}");
      await expect(compile()).rejects.toThrow(/file type/);
    });

    it("refuses hostile nesting before the parser sees it", async () => {
      write("index.md", "# Demo\n\n" + ">".repeat(200_000) + " deep\n");
      await expect(compile({ maxMarkdownBytes: 300_000 })).rejects.toThrow(
        /nested more than 32 levels/,
      );
      write("index.md", "# Demo\n\n" + "<div>".repeat(6000) + "\n");
      await expect(compile({ maxMarkdownBytes: 300_000 })).rejects.toThrow(
        /HTML tags/,
      );
    });
  });

  it("rejects an invalid project slug", async () => {
    write("index.md", "# Demo\n");
    await expect(
      compileUntrustedDocs(docs, { project: "../evil" }),
    ).rejects.toThrow(/isn't a valid slug/);
  });
});

describe("the club's own docs", () => {
  it("still compile and render under the trusted policy", async () => {
    const repoDocs = path.resolve(import.meta.dirname, "../../../docs");
    const { pages } = compileDocs(repoDocs);
    expect(pages.length).toBeGreaterThan(50);
    const rendered = await renderPages(pages);
    expect(rendered.every((p) => p.html.length > 0)).toBe(true);
    // The compiler's own stamp never reaches output.
    expect(rendered.some((p) => /data-docs-gen[a-z]{8,}/.test(p.html))).toBe(
      false,
    );
  }, 120_000);
});
