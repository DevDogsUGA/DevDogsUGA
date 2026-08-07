import { defineConfig, mergeConfig } from "vitest/config";
import { reactPreset } from "@devdogsuga/config/vitest/react";

export default mergeConfig(
  reactPreset,
  defineConfig({
    test: { include: ["src/**/*.test.{ts,tsx}"] },
  }),
);
