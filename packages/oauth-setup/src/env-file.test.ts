import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { upsertEnvLocal } from "./env-file.js";

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "oauth-setup-"));
}

describe("upsertEnvLocal", () => {
  it("updates existing keys in place and appends new ones", () => {
    const dir = tempDir();
    writeFileSync(
      join(dir, ".env.local"),
      "# comment\nEXISTING=old\nOTHER=keep\n",
    );

    upsertEnvLocal(dir, { EXISTING: "new", ADDED: "value" });

    const result = readFileSync(join(dir, ".env.local"), "utf-8");
    expect(result).toContain("# comment");
    expect(result).toContain('EXISTING="new"');
    expect(result).toContain("OTHER=keep");
    expect(result).toContain('ADDED="value"');
    expect(result).not.toContain("EXISTING=old");
  });

  it("creates the file when it does not exist", () => {
    const dir = tempDir();
    upsertEnvLocal(dir, { KEY: "v" });
    expect(readFileSync(join(dir, ".env.local"), "utf-8")).toContain('KEY="v"');
  });

  it("escapes quotes and backslashes in values", () => {
    const dir = tempDir();
    upsertEnvLocal(dir, { K: 'a"b\\c' });
    expect(readFileSync(join(dir, ".env.local"), "utf-8")).toContain(
      'K="a\\"b\\\\c"',
    );
  });
});
