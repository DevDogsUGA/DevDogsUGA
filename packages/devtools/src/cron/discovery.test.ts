import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { PROJECT_ROOT } from "../environment.js";
import { discoverWranglerConfigs, parseWrangler } from "./discovery.js";

describe("parseWrangler", () => {
  it("accepts JSONC without stripping // from URL strings", () => {
    const dir = join(
      tmpdir(),
      `devtools-wrangler-${process.pid}-${Date.now()}`,
    );
    mkdirSync(dir, { recursive: true });
    const path = join(dir, "wrangler.jsonc");
    try {
      writeFileSync(
        path,
        '{\n  // comment\n  "name": "development-test",\n  "vars": { "ORIGIN": "https://example.test/path" },\n}\n',
      );
      expect(parseWrangler(path)).toMatchObject({ name: "development-test" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("discoverWranglerConfigs", () => {
  it("discovers every app with wrangler.jsonc instead of using an allowlist", () => {
    const appsRoot = join(PROJECT_ROOT, "apps");
    const expected = readdirSync(appsRoot)
      .filter((app) => existsSync(join(appsRoot, app, "wrangler.jsonc")))
      .sort();
    expect(discoverWranglerConfigs().map(({ app }) => app)).toEqual(expected);
  });
});
