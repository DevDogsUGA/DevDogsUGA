import { existsSync, readFileSync, statSync } from "node:fs";
import { z } from "zod";
import { describe, expect, it } from "vitest";
import type { EnvEntry } from "@devdogsuga/env";
import { createTemporaryWranglerEnv, withWranglerEnv } from "./local-env.js";

/** The fields `withWranglerEnv` reads are `key`, `source`, and `meta`; the rest
 * exist only to satisfy `EnvEntry`'s shape. */
function entry(
  key: string,
  source: string,
  meta?: Partial<EnvEntry["meta"]>,
): EnvEntry {
  return {
    key,
    source,
    schema: z.string(),
    meta: {
      doc: "test fixture",
      scope: "environment",
      secrecy: "public",
      ...meta,
    },
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

  it("excludes commented default-scope keys (DEPLOY_ENV/NODE_ENV) so a stray .env value can't override the wrangler tier var", async () => {
    const entries = [
      entry("DEPLOY_ENV", "sandbox", { scope: "default", commented: true }),
      entry("NODE_ENV", "sandbox", { scope: "default", commented: true }),
      // A default-scope key that is NOT commented is genuinely env-sourced and
      // must still be materialized.
      entry("GITHUB_ORG", "sandbox", { scope: "default" }),
      entry("API_URL", "sandbox"),
    ];
    const env = {
      DEPLOY_ENV: "",
      NODE_ENV: "production",
      GITHUB_ORG: "devdogsuga",
      API_URL: "https://api.example",
    };

    const rendered = await withWranglerEnv(
      "sandbox",
      async (path) => readFileSync(path, "utf8"),
      { env, entries },
    );

    expect(rendered).toBe(
      "API_URL='https://api.example'\nGITHUB_ORG='devdogsuga'\n",
    );
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

describe("createTemporaryWranglerEnv", () => {
  // Unlike `withWranglerEnv`, this function takes no `entries` override — its
  // one caller (`workflows/commands.ts`'s temp session) always wants the real
  // registry — so this exercises a real app slug (`apps/sandbox/env.ts`
  // declares `PLATFORM_REST_URL` with `source: "sandbox"`) rather than an
  // injected fixture.
  it("materializes from the given env, not process.env, and cleans up on remove()", async () => {
    const previous = process.env.PLATFORM_REST_URL;
    // A decoy in process.env: if `createTemporaryWranglerEnv` ever fell back
    // to `process.env` despite an `env` argument being given, this value
    // would leak into the file instead of the injected one below.
    process.env.PLATFORM_REST_URL = "https://process-env-decoy.example/rest/v1";
    try {
      const { path, remove } = await createTemporaryWranglerEnv("sandbox", {
        PLATFORM_REST_URL: "https://injected.example/rest/v1",
      });
      try {
        expect(existsSync(path)).toBe(true);
        const contents = readFileSync(path, "utf8");
        expect(contents).toContain(
          "PLATFORM_REST_URL='https://injected.example/rest/v1'",
        );
        expect(contents).not.toContain("process-env-decoy");
      } finally {
        remove();
      }
      expect(existsSync(path)).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.PLATFORM_REST_URL;
      else process.env.PLATFORM_REST_URL = previous;
    }
  });
});
