import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeIfChanged } from "./write.js";

describe("writeIfChanged", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "docs-kit-write-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("creates the file, and its folders, when it is missing", () => {
    const file = path.join(dir, "a", "b.txt");
    expect(writeIfChanged(file, "one")).toBe(true);
    expect(fs.readFileSync(file, "utf-8")).toBe("one");
  });

  it("leaves identical content alone", () => {
    const file = path.join(dir, "a.txt");
    writeIfChanged(file, "same");
    const before = fs.statSync(file).ino;

    expect(writeIfChanged(file, "same")).toBe(false);
    expect(fs.statSync(file).ino).toBe(before);
  });

  it("replaces changed content and leaves no temp file behind", () => {
    const file = path.join(dir, "a.txt");
    writeIfChanged(file, "old");

    expect(writeIfChanged(file, "new")).toBe(true);
    expect(fs.readFileSync(file, "utf-8")).toBe("new");
    expect(fs.readdirSync(dir)).toEqual(["a.txt"]);
  });
});
