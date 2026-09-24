import { defineConfig, mergeConfig } from "vitest/config";
import { nodePreset } from "@devdogsuga/config/vitest/node";

/**
 * The default lane: structural assertions only (workers.json, the env
 * registry) — no live process, no .env file, no database. Safe in CI's
 * plain "Lint + typecheck + test (affected)" job, which deliberately has
 * neither.
 *
 * `src/live/**` is excluded here on purpose: those tests spawn the real
 * `devtools`/`devtools-ci` bins, which resolve a session tier and so need a
 * real `.env` (present, or ambiguous-refusal) — see vitest.live.config.ts
 * and `test:live`.
 */
export default mergeConfig(
  nodePreset,
  defineConfig({
    test: {
      include: ["src/**/*.test.ts"],
      exclude: ["src/live/**", "**/node_modules/**"],
    },
  }),
);
