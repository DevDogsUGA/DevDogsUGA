import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vitest/config";
import { reactPreset } from "@devdogsuga/config/vitest/react";
import type { Plugin } from "vite";

/**
 * This app runs under plain Vitest, not `@cloudflare/vitest-pool-workers` --
 * there's no workerd underneath, so `cloudflare:*` specifiers (e.g.
 * `~/server/db`'s `import { env } from "cloudflare:workers"`) are not
 * resolvable modules here the way they are under `@cloudflare/vite-plugin`'s
 * workerd environments (dev/build/deploy). Without this plugin, Vite's
 * import-analysis fails resolution before a test's `vi.mock("cloudflare:workers",
 * ...)` ever gets a chance to intercept it -- marking the specifier merely
 * `external` fixes THAT failure but then Vitest's SSR module runner tries to
 * hand it to Node's real dynamic `import()`, which doesn't know the scheme
 * either. Claiming it as an ordinary (non-external) virtual module, with any
 * loadable placeholder body, keeps it a normal node in Vite's module graph --
 * which is what lets `vi.mock` swap in a fake `env` per test.
 */
const cloudflareModulesStub: Plugin = {
  name: "cloudflare-modules-stub",
  resolveId(id) {
    if (id.startsWith("cloudflare:")) return id;
  },
  load(id) {
    if (id.startsWith("cloudflare:")) return "export const env = {};";
  },
};

export default mergeConfig(
  reactPreset,
  defineConfig({
    plugins: [cloudflareModulesStub],
    // `~` is the app's import alias everywhere outside tests (tsconfig paths),
    // and Vitest does not read those. Without it, a test touching any module
    // that imports `~/...` fails to TRANSFORM rather than failing an
    // assertion, which reads as a broken test rather than a missing alias.
    resolve: {
      alias: { "~": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    test: {
      // `cloudflare/**` holds the Worker entry and cron dispatcher, which live
      // outside `src` but still need their own tests discovered.
      include: ["src/**/*.test.{ts,tsx}", "cloudflare/**/*.test.ts"],
      // Vite defines its own `BASE_URL`: the public base path, `"/"` unless
      // configured. Vitest puts it in `process.env`. The app happens to have a
      // server variable of the same name that must be an absolute URL, so the
      // collision makes `env.ts` throw "Invalid URL" in ANY test that reaches a
      // server module, for a reason unrelated to the test. Restoring the real
      // value — schedule-builder's own dev port — is what lets those tests run.
      env: { BASE_URL: process.env.BASE_URL ?? "http://localhost:3001" },
    },
  }),
);
