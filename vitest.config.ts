import { defineConfig, mergeConfig } from "vitest/config";
import { nodePreset } from "@devdogsuga/config/vitest/node";

// Root-level tests are the repo scripts (scripts/*.test.ts). Packages and apps
// have their own configs; `pnpm -r` never selects the root, so nothing else
// reaches this one.
export default mergeConfig(
  nodePreset,
  defineConfig({
    test: { include: ["scripts/**/*.test.ts"] },
  }),
);
