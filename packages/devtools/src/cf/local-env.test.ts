import { existsSync, readFileSync, statSync } from "node:fs";
import { z } from "zod";
import { describe, expect, it } from "vitest";
import type { EnvEntry } from "@devdogsuga/env";
import { withWranglerEnv } from "./local-env.js";

/** The fields `withWranglerEnv` reads are `key` and `source`; the rest exist
 * only to satisfy `EnvEntry`'s shape. */
function entry(key: string, source: string): EnvEntry {
  return {
    key,
    source,
    schema: z.string(),
    meta: { doc: "test fixture", scope: "environment", secrecy: "public" },
    client: false,
  };
}

describe("withWranglerEnv", () => {
  it("includes only entries whose source is the requested app, deduped and sorted", async () => {
    const entries = [
      entry("ZEBRA", "sandbox"),
      entry("ALPHA", "sandbox"),
      entry("ALPHA", "sandbox"), // duplicate declaration, e.g. re-imported manifest
      entry("OTHER_APP_KEY", "platform"),
    ];
    const env = { ZEBRA: "z-value", ALPHA: "a-value", OTHER_APP_KEY: "nope" };

    const rendered = await withWranglerEnv(
      "sandbox",
      async (path) => readFileSync(path, "utf8"),
      { env, entries },
    );

    expect(rendered).toBe("ALPHA='a-value'\nZEBRA='z-value'\n");
  });

  it("skips keys with no value in the injected environment", async () => {
    const entries = [entry("PRESENT", "sandbox"), entry("ABSENT", "sandbox")];
    const env = { PRESENT: "here" };

    const rendered = await withWranglerEnv(
      "sandbox",
      async (path) => readFileSync(path, "utf8"),
      { env, entries },
    );

    expect(rendered).toBe("PRESENT='here'\n");
  });

  it("writes the file at mode 0600 and the callback's return value passes through", async () => {
    const entries = [entry("KEY", "sandbox")];
    const env = { KEY: "value" };

    const result = await withWranglerEnv(
      "sandbox",
      async (path) => {
        const mode = statSync(path).mode & 0o777;
        expect(mode).toBe(0o600);
        return 42;
      },
      { env, entries },
    );

    expect(result).toBe(42);
  });

  it("removes the directory after the callback resolves", async () => {
    let capturedPath = "";
    await withWranglerEnv(
      "sandbox",
      async (path) => {
        capturedPath = path;
        expect(existsSync(path)).toBe(true);
      },
      { env: {}, entries: [] },
    );

    expect(existsSync(capturedPath)).toBe(false);
  });

  it("removes the directory even when the callback throws", async () => {
    let capturedPath = "";
    await expect(
      withWranglerEnv(
        "sandbox",
        async (path) => {
          capturedPath = path;
          throw new Error("boom");
        },
        { env: {}, entries: [] },
      ),
    ).rejects.toThrow("boom");

    expect(existsSync(capturedPath)).toBe(false);
  });
});
