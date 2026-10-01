import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadDevtoolsCommands } from "./devtools-catalog.js";

let root: string;

describe("loadDevtoolsCommands", () => {
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("returns null when devtools is not installed", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-build-devtools-"));
    await expect(loadDevtoolsCommands(root)).resolves.toBeNull();
  });

  it("reads allPaths() off a built devtools, space-joining each path", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-build-devtools-"));
    const dir = path.join(root, "node_modules/@devdogsuga/devtools/dist");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "commands.js"),
      `export function allPaths() { return [["db"], ["db", "migration", "new"]]; }\n`,
      "utf-8",
    );

    const commands = await loadDevtoolsCommands(root);
    expect(commands).not.toBeNull();
    expect([...(commands ?? [])].sort()).toEqual(["db", "db migration new"]);
  });

  it("returns null when the built module has no allPaths export", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-build-devtools-"));
    const dir = path.join(root, "node_modules/@devdogsuga/devtools/dist");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "commands.js"),
      "export const nope = 1;\n",
      "utf-8",
    );

    await expect(loadDevtoolsCommands(root)).resolves.toBeNull();
  });
});
