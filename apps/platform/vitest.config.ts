import { defineConfig, mergeConfig } from "vitest/config";
import { reactPreset } from "@devdogsuga/config/vitest/react";

// Unit + component tests only. Playwright E2E specs live in ./e2e and are run
// separately via `pnpm test:e2e`.
export default mergeConfig(
  reactPreset,
  defineConfig({
    test: { include: ["src/**/*.test.{ts,tsx}"] },
  }),
);
