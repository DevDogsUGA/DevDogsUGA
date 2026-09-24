import { defineConfig, mergeConfig } from "vitest/config";
import { nodePreset } from "@devdogsuga/config/vitest/node";

/**
 * The "live" lane: black-box tests that spawn the real installed
 * `devtools`/`devtools-ci` bins as subprocesses (src/live/cron-contract.
 * test.ts, src/live/deploy-cli-dispatch.test.ts, src/live/
 * emails-generation.test.ts — the replacements for packages/devtools'
 * cron/contract.test.ts, deploy/cli-dispatch.test.ts and the generation half
 * of emails/commands.test.ts). Every `devtools` command resolves a session
 * tier before dispatch, so this needs a real `.env` on disk and, for the
 * cases that touch local-vs-remote ambiguity, `DEV_DB=local` — neither of
 * which CI's plain "Lint + typecheck + test (affected)" job has. Separate
 * from the default lane for the same reason packages/supabase's
 * vitest.rls.config.ts is: run via `pnpm --filter @devdogsuga/repo-checks
 * run test:live` from the "database" CI job (ci.yaml), which already
 * composes `.env`/`.env.generated` and starts the local Supabase stack for
 * the RLS suite.
 *
 * A cold process boot (pnpm exec resolving + node startup + devtools' own
 * module graph) is far slower than an ordinary unit test, hence the
 * subprocess-sized deadline.
 */
export default mergeConfig(
  nodePreset,
  defineConfig({
    test: {
      include: ["src/live/**/*.test.ts"],
      testTimeout: 30_000,
      hookTimeout: 30_000,
    },
  }),
);
