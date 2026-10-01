import { defineConfig, mergeConfig } from "vitest/config";
import { nodePreset } from "@devdogsuga/config/vitest/node";

export default mergeConfig(
  nodePreset,
  defineConfig({
    test: { include: ["src/**/*.test.ts"] },
  }),
);
