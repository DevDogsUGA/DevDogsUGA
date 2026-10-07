import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";
import { kvDataAdapter } from "@vinext/cloudflare/cache/kv-data-adapter";
import { cdnAdapter } from "@vinext/cloudflare/cache/cdn-adapter";
import { imagesOptimizer } from "@vinext/cloudflare/images/images-optimizer";
import path from "node:path";

export default defineConfig({
  plugins: [
    // `cache.data`/`cache.cdn` replace OpenNext's R2 incremental cache +
    // in-memory revalidation queue: `kvDataAdapter()` backs fetch/`use cache`
    // reads with the `VINEXT_KV_CACHE` binding (wrangler.jsonc), and
    // `cdnAdapter()` puts CDN-cacheable responses through the deployed
    // Worker's own Cache API (wrangler.jsonc's top-level `cache.enabled`)
    // instead of `WORKER_SELF_REFERENCE` re-invoking itself.
    vinext({
      cache: { data: kvDataAdapter(), cdn: cdnAdapter() },
      images: { optimizer: imagesOptimizer() },
    }),
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
  resolve: {
    alias: {
      // Vite does not read tsconfig `paths` -- `~` is the app's alias
      // everywhere else (tsconfig.json, vitest.config.ts). Without it here,
      // `cloudflare/ScrapeWorkflow.ts`'s `~/lib/parsers` and
      // `~/server/db/create` imports fail to bundle (this entry is built as
      // part of the SAME Vite graph as the app, per wrangler.jsonc's `main:
      // "cloudflare/worker.ts"`, not compiled separately by wrangler/esbuild
      // the way the old OpenNext worker.js re-export was).
      "~": path.resolve(import.meta.dirname, "src"),
    },
  },
  // Off by default. Backstage's `getsentry/action-release` step uploads
  // these from `dist/**` so Sentry can resolve stack traces, and
  // `public/.assetsignore` keeps the client ones out of the deployed assets.
  build: {
    sourcemap: true,
  },
});
