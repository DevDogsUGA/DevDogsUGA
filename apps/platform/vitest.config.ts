import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vitest/config";
import { reactPreset } from "@devdogsuga/config/vitest/react";

// Unit + component tests only. Playwright E2E specs live in ./e2e and are run
// separately via `pnpm test:e2e`.
export default mergeConfig(
  reactPreset,
  defineConfig({
    // `~` is the app's import alias everywhere outside tests (tsconfig paths),
    // and Vitest does not read those. Without it, a test touching any module
    // that imports `~/...` fails to TRANSFORM rather than failing an
    // assertion — which reads as a broken test rather than a missing alias.
    resolve: {
      alias: { "~": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    test: { include: ["src/**/*.test.{ts,tsx}"] },
  }),
);
