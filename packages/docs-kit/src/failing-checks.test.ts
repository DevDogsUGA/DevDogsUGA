import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { printFailingChecks, runFailingChecks } from "./failing-checks.js";
import type { CompiledPage } from "./types.js";

function page(overrides: Partial<CompiledPage> = {}): CompiledPage {
  return {
    title: "Untitled",
    description: null,
    order: null,
    frontmatter: {},
    headings: [],
    content: "",
    plainText: "",
    project: "toolkit",
    path: "toolkit/index",
    section: null,
    mountedFrom: null,
    publishAt: null,
    variants: {
      project: overrides.project ?? "toolkit",
      projects: [],
      os: ["macos", "linux", "wsl"],
      file: "test.md",
    },
    ...overrides,
  };
}

let root: string;

describe("runFailingChecks / printFailingChecks", () => {
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("reports the devtools catalog as missing when it could not be loaded", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-build-failing-"));
    fs.writeFileSync(
      path.join(root, "pnpm-workspace.yaml"),
      'packages:\n  - "apps/*"\n',
    );
    const contentRoot = path.join(root, "docs");
    fs.mkdirSync(contentRoot, { recursive: true });

    const result = await runFailingChecks(contentRoot, [
      page({ content: "no devtools here" }),
    ]);

    expect(result.devtoolsCatalogMissing).toBe(true);
    expect(result.linkErrors).toEqual([]);
    expect(result.commandErrors).toEqual([]);
  });

  it("prints a one-line notice when the devtools catalog is missing, even with no errors", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      printFailingChecks({
        linkErrors: [],
        commandErrors: [],
        devtoolsCatalogMissing: true,
      });
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0]?.[0]).toContain("devtools catalog not found");
    } finally {
      spy.mockRestore();
    }
  });

  it("prints nothing when there are no errors and the catalog loaded fine", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      printFailingChecks({
        linkErrors: [],
        commandErrors: [],
        devtoolsCatalogMissing: false,
      });
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
