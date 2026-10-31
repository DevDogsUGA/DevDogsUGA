import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  describeVerdict,
  docsFolder,
  docsKitBin,
  DOCS_KIT_BIN,
  parseVerdict,
  type DocsVerdict,
} from "./check.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
const tmp = () => {
  const dir = mkdtempSync(join(tmpdir(), "devtools-docs-"));
  dirs.push(dir);
  return dir;
};

const verdict = (over: Partial<DocsVerdict> = {}): DocsVerdict => ({
  ready: true,
  problems: [],
  pages: 3,
  assets: 1,
  ...over,
});

describe("which folder is checked", () => {
  it("is the one named, from where the command is run", () => {
    expect(
      docsFolder(
        "../other/docs",
        { kind: "backstage", root: "/r" },
        "/work/here",
      ),
    ).toEqual({ dir: "/work/other/docs" });
  });

  it("is docs/ at the root of the repository being run from", () => {
    expect(
      docsFolder(
        undefined,
        { kind: "backstage", root: "/projects/dogdays" },
        "/x",
      ),
    ).toEqual({ dir: "/projects/dogdays/docs" });
  });

  it("is never DevDogsUGA's own docs/ unless it is named, which are the club's and not a project's", () => {
    const result = docsFolder(
      undefined,
      { kind: "devdogsuga", root: "/r" },
      "/r",
    );
    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toContain(
      "devtools docs check <folder>",
    );
    expect(
      docsFolder("docs/mine", { kind: "devdogsuga", root: "/r" }, "/r"),
    ).toEqual({
      dir: "/r/docs/mine",
    });
  });
});

describe("finding docs-kit", () => {
  it("is the bin in the checkout, or null when the checkout has none", () => {
    const root = tmp();
    expect(docsKitBin(root)).toBeNull();
    mkdirSync(join(root, "packages", "docs-kit", "bin"), { recursive: true });
    writeFileSync(join(root, DOCS_KIT_BIN), "");
    expect(docsKitBin(root)).toBe(join(root, DOCS_KIT_BIN));
  });
});

describe("reading what docs-kit printed", () => {
  it("takes the verdict from the last line, whatever was printed before it", () => {
    const out = `warming up\n${JSON.stringify(verdict())}\n`;
    expect(parseVerdict(out)).toEqual(verdict());
  });

  it("is null for anything that is not a verdict", () => {
    for (const text of ["", "oops", "{}", "[]", '{"ready":true}', "null"])
      expect(parseVerdict(text), text).toBeNull();
  });
});

describe("what is said", () => {
  it("one line on stdout for a ready folder", () => {
    expect(describeVerdict(verdict())).toEqual({
      code: 0,
      stdout: "docs check: ready (3 pages, 1 image).\n",
      stderr: "",
    });
    expect(describeVerdict(verdict({ pages: 1, assets: 0 })).stdout).toBe(
      "docs check: ready (1 page, 0 images).\n",
    );
  });

  it("each problem with its file on stderr, and exit 1", () => {
    const said = describeVerdict(
      verdict({
        ready: false,
        problems: [
          { kind: "link", file: "index.md:3", message: 'links to "./gone.md"' },
          { kind: "structure", file: null, message: "has no overview page" },
        ],
      }),
    );
    expect(said.code).toBe(1);
    expect(said.stdout).toBe("");
    expect(said.stderr).toBe(
      'docs check: 2 problems\n  index.md:3: links to "./gone.md"\n  has no overview page\n',
    );
    expect(
      describeVerdict(
        verdict({
          ready: false,
          problems: [{ kind: "link", file: "a.md", message: "x" }],
        }),
      ).stderr,
    ).toContain("docs check: 1 problem\n");
  });
});
