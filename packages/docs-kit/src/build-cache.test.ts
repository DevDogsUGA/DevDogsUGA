import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type FileEntry,
  collectInputs,
  computeSignature,
} from "./build-cache.js";

const BASE: FileEntry[] = [
  { relPath: "docs/platform/index.md", mtimeMs: 1000, size: 40 },
  { relPath: "packages/env/src/index.ts", mtimeMs: 2000, size: 120 },
];

describe("computeSignature", () => {
  it("is deterministic for the same entries and compiler identity", () => {
    expect(computeSignature(BASE, "c@1")).toBe(computeSignature(BASE, "c@1"));
  });

  it("does not depend on entry order", () => {
    expect(computeSignature([...BASE].reverse(), "c@1")).toBe(
      computeSignature(BASE, "c@1"),
    );
  });

  it("changes when a file's mtime, size or presence changes", () => {
    const base = computeSignature(BASE, "c@1");
    const touched = [{ ...BASE[0]!, mtimeMs: 1001 }, BASE[1]!];
    const resized = [BASE[0]!, { ...BASE[1]!, size: 121 }];
    const added = [...BASE, { relPath: "docs/a.md", mtimeMs: 1, size: 1 }];
    expect(computeSignature(touched, "c@1")).not.toBe(base);
    expect(computeSignature(resized, "c@1")).not.toBe(base);
    expect(computeSignature(added, "c@1")).not.toBe(base);
  });

  it("changes when the compiler's identity changes", () => {
    expect(computeSignature(BASE, "c@2")).not.toBe(
      computeSignature(BASE, "c@1"),
    );
  });

  it("keeps each stat attached to its own path", () => {
    const swapped: FileEntry[] = [
      { ...BASE[0]!, mtimeMs: BASE[1]!.mtimeMs, size: BASE[1]!.size },
      { ...BASE[1]!, mtimeMs: BASE[0]!.mtimeMs, size: BASE[0]!.size },
    ];
    expect(computeSignature(swapped, "c@1")).not.toBe(
      computeSignature(BASE, "c@1"),
    );
  });
});

describe("collectInputs", () => {
  let root: string;

  const write = (relPath: string, text = ""): void => {
    const file = path.join(root, relPath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  };

  const collected = (): string[] =>
    collectInputs(root, path.join(root, "docs"))
      .map((file) => path.relative(root, file).replace(/\\/g, "/"))
      .sort();

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-build-cache-"));
    write(
      "pnpm-workspace.yaml",
      'packages:\n  - "apps/*"\n  - "packages/*"\n  - "docs"\n',
    );
    write("package.json", "{}");
    write("docs/package.json", '{"name":"docs"}');
    write("docs/platform/index.md");
    write("docs/toolkit/reference/env.md");
    write("docs/dist/index.js");
    write("packages/env/package.json", '{"name":"env"}');
    write("packages/env/tsconfig.json", "{}");
    write("packages/env/src/index.ts");
    write("packages/env/src/index.test.ts");
    write("packages/env/src/generated/schema.ts");
    write("apps/platform/package.json", '{"name":"platform"}');
    write("apps/platform/src/page.tsx");
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("watches content, the generator's package scope and every manifest", () => {
    expect(collected()).toEqual([
      "apps/platform/package.json",
      "docs/package.json",
      "docs/platform/index.md",
      "package.json",
      "packages/env/package.json",
      "packages/env/src/index.ts",
      "packages/env/tsconfig.json",
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
    ]);
  });

  it("skips a package the generator would skip", () => {
    fs.rmSync(path.join(root, "packages/env/tsconfig.json"));
    expect(collected()).not.toContain("packages/env/src/index.ts");
  });
});
