import { describe, expect, it } from "vitest";
import { type FileEntry, computeSignature } from "./signature.js";

const BASE: FileEntry[] = [
  { relPath: "docs/platform/index.md", mtimeMs: 1000, size: 40 },
  { relPath: "apps/platform/src/lib/range.ts", mtimeMs: 2000, size: 120 },
];

describe("computeSignature", () => {
  it("is deterministic for the same entries and compiler identity", () => {
    const a = computeSignature(BASE, "compiler@0.1.0");
    const b = computeSignature(BASE, "compiler@0.1.0");
    expect(a).toBe(b);
  });

  it("does not depend on entry order — a directory walk is not guaranteed stable", () => {
    const forward = computeSignature(BASE, "compiler@0.1.0");
    const reversed = computeSignature([...BASE].reverse(), "compiler@0.1.0");
    expect(forward).toBe(reversed);
  });

  it("changes when a watched file's mtime changes", () => {
    const touched = BASE.map((entry, i) =>
      i === 0 ? { ...entry, mtimeMs: entry.mtimeMs + 1 } : entry,
    );
    expect(computeSignature(touched, "compiler@0.1.0")).not.toBe(
      computeSignature(BASE, "compiler@0.1.0"),
    );
  });

  it("changes when a watched file's size changes", () => {
    const resized = BASE.map((entry, i) =>
      i === 1 ? { ...entry, size: entry.size + 1 } : entry,
    );
    expect(computeSignature(resized, "compiler@0.1.0")).not.toBe(
      computeSignature(BASE, "compiler@0.1.0"),
    );
  });

  it("changes when a file is added or removed", () => {
    const extra = [
      ...BASE,
      { relPath: "docs/toolkit/index.md", mtimeMs: 3000, size: 10 },
    ];
    expect(computeSignature(extra, "compiler@0.1.0")).not.toBe(
      computeSignature(BASE, "compiler@0.1.0"),
    );
  });

  it("changes when the resolved docs-compiler identity changes — e.g. a repacked interim tarball", () => {
    const a = computeSignature(BASE, "compiler@0.1.0");
    const b = computeSignature(BASE, "compiler@0.1.0-repacked");
    expect(a).not.toBe(b);
  });

  it("distinguishes two files whose (path, mtime, size) triples only differ by which value belongs to which path", () => {
    const swapped: FileEntry[] = [
      {
        relPath: BASE[0]!.relPath,
        mtimeMs: BASE[1]!.mtimeMs,
        size: BASE[1]!.size,
      },
      {
        relPath: BASE[1]!.relPath,
        mtimeMs: BASE[0]!.mtimeMs,
        size: BASE[0]!.size,
      },
    ];
    expect(computeSignature(swapped, "compiler@0.1.0")).not.toBe(
      computeSignature(BASE, "compiler@0.1.0"),
    );
  });
});
