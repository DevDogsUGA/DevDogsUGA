import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  appPackagesBySlug,
  discoverWorkspacePackages,
  findWorkspaceRoot,
  readRootPackage,
} from "./workspace.js";

let root: string;

function write(rel: string, content: string): void {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf-8");
}

describe("workspace", () => {
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("finds the repo root by walking up to pnpm-workspace.yaml", () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-build-workspace-"));
    write("pnpm-workspace.yaml", 'packages:\n  - "apps/*"\n  - "packages/*"\n');
    write("apps/foo/package.json", JSON.stringify({ name: "foo" }));

    expect(findWorkspaceRoot(path.join(root, "apps/foo"))).toBe(root);
    expect(findWorkspaceRoot(os.tmpdir())).toBeNull();
  });

  it("discovers a package under each glob, with its scripts", () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-build-workspace-"));
    write("pnpm-workspace.yaml", 'packages:\n  - "apps/*"\n  - "packages/*"\n');
    write(
      "apps/foo/package.json",
      JSON.stringify({ name: "foo", scripts: { dev: "vite" } }),
    );
    write(
      "packages/bar/package.json",
      JSON.stringify({ name: "@scope/bar", scripts: { build: "tsc" } }),
    );

    const packages = discoverWorkspacePackages(root);
    expect(packages.map((p) => p.name).sort()).toEqual(["@scope/bar", "foo"]);
    const foo = packages.find((p) => p.name === "foo");
    expect(foo?.dir).toBe("apps/foo");
    expect([...(foo?.scripts ?? [])]).toEqual(["dev"]);
  });

  it("keys apps by their directory slug", () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-build-workspace-"));
    write("pnpm-workspace.yaml", 'packages:\n  - "apps/*"\n');
    write(
      "apps/schedule-builder/package.json",
      JSON.stringify({ name: "schedule-builder" }),
    );

    const byApp = appPackagesBySlug(discoverWorkspacePackages(root));
    expect([...byApp.keys()]).toEqual(["schedule-builder"]);
  });

  it("discovers a bare (non-glob) workspace entry as its own single package", () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-build-workspace-"));
    write("pnpm-workspace.yaml", 'packages:\n  - "apps/*"\n  - "docs"\n');
    write(
      "docs/package.json",
      JSON.stringify({
        name: "@devdogsuga/docs",
        scripts: { build: "tsx build.ts" },
      }),
    );

    const packages = discoverWorkspacePackages(root);
    const docs = packages.find((p) => p.name === "@devdogsuga/docs");
    expect(docs?.dir).toBe("docs");
    expect([...(docs?.scripts ?? [])]).toEqual(["build"]);
  });

  it("does not let a comment line between list items end the packages list", () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-build-workspace-"));
    write(
      "pnpm-workspace.yaml",
      "packages:\n  - apps/*\n  # a bare entry, not a glob\n  - docs\n\nshellEmulator: true\n",
    );
    write("apps/foo/package.json", JSON.stringify({ name: "foo" }));
    write("docs/package.json", JSON.stringify({ name: "@devdogsuga/docs" }));

    const packages = discoverWorkspacePackages(root);
    expect(packages.map((p) => p.name).sort()).toEqual([
      "@devdogsuga/docs",
      "foo",
    ]);
  });

  it("reads the workspace root's own scripts", () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-build-workspace-"));
    write("pnpm-workspace.yaml", 'packages:\n  - "apps/*"\n');
    write(
      "package.json",
      JSON.stringify({ name: "devdogsuga", scripts: { lint: "eslint ." } }),
    );

    const rootPackage = readRootPackage(root);
    expect(rootPackage?.name).toBe("devdogsuga");
    expect(rootPackage?.scripts.has("lint")).toBe(true);
  });
});
