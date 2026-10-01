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

  it("fails when a command list cannot be loaded", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-build-failing-"));
    fs.writeFileSync(
      path.join(root, "pnpm-workspace.yaml"),
      'packages:\n  - "apps/*"\n',
    );
    const contentRoot = path.join(root, "docs");
    fs.mkdirSync(contentRoot, { recursive: true });
    const script = path.join(root, "broken.mjs");
    fs.writeFileSync(script, "process.exit(1);\n");

    const before = { ...process.env };
    process.env["DOCS_KIT_DEVTOOLS_CMD"] = `node ${script}`;
    process.env["DOCS_KIT_BACKSTAGE_CMD"] = `node ${script}`;
    try {
      const result = await runFailingChecks(contentRoot, [
        page({ content: "no commands here" }),
      ]);

      expect(result.catalogErrors).toHaveLength(2);
      expect(result.catalogErrors[0]).toContain("DOCS_KIT_DEVTOOLS_CMD");
      expect(result.catalogErrors[1]).toContain("DOCS_KIT_BACKSTAGE_CMD");
      expect(result.linkErrors).toEqual([]);
      expect(result.commandErrors).toEqual([]);
    } finally {
      process.env["DOCS_KIT_DEVTOOLS_CMD"] = before["DOCS_KIT_DEVTOOLS_CMD"];
      process.env["DOCS_KIT_BACKSTAGE_CMD"] = before["DOCS_KIT_BACKSTAGE_CMD"];
      for (const key of ["DOCS_KIT_DEVTOOLS_CMD", "DOCS_KIT_BACKSTAGE_CMD"]) {
        if (process.env[key] === undefined) delete process.env[key];
      }
    }
  });

  it("checks commands against the lists the CLIs print", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-build-failing-"));
    fs.writeFileSync(
      path.join(root, "pnpm-workspace.yaml"),
      'packages:\n  - "apps/*"\n',
    );
    const contentRoot = path.join(root, "docs");
    fs.mkdirSync(contentRoot, { recursive: true });
    const script = path.join(root, "cli.mjs");
    fs.writeFileSync(
      script,
      `process.stdout.write(JSON.stringify({ commands: [{ path: "setup" }] }));\n`,
    );

    process.env["DOCS_KIT_DEVTOOLS_CMD"] = `node ${script}`;
    process.env["DOCS_KIT_BACKSTAGE_CMD"] = `node ${script}`;
    try {
      const result = await runFailingChecks(contentRoot, [
        page({
          content: "```sh\npnpm devtools setup\npnpm devtools gone\n```\n",
        }),
      ]);

      expect(result.catalogErrors).toEqual([]);
      expect(result.commandErrors).toHaveLength(1);
      expect(result.commandErrors[0]?.message).toContain("pnpm devtools gone");
    } finally {
      delete process.env["DOCS_KIT_DEVTOOLS_CMD"];
      delete process.env["DOCS_KIT_BACKSTAGE_CMD"];
    }
  });

  it("prints a load failure as an error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      printFailingChecks({
        linkErrors: [],
        commandErrors: [],
        catalogErrors: ["Could not run `pnpm devtools --help --json`"],
      });
      expect(spy.mock.calls[0]?.[0]).toContain("1 error(s)");
      expect(spy.mock.calls[1]?.[0]).toContain("Could not run");
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
        catalogErrors: [],
      });
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
