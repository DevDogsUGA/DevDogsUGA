import { nodePreset } from "@devdogsuga/config/vitest/node";
import { defineConfig, mergeConfig } from "vitest/config";

export default mergeConfig(
  nodePreset,
  defineConfig({
    test: { include: ["src/**/*.test.ts"] },
  }),
);
