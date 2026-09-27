import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";
import { kvDataAdapter } from "@vinext/cloudflare/cache/kv-data-adapter";
import { cdnAdapter } from "@vinext/cloudflare/cache/cdn-adapter";
import { imagesOptimizer } from "@vinext/cloudflare/images/images-optimizer";

// `next dev --experimental-https` (the pre-vinext `dev` script) generated
// its own throwaway self-signed cert on every run, with nothing committed to
// disk. Vite's dev server has no equivalent auto-generation -- `server.https`
// wants real key/cert file paths -- so this reads a `certificates/` pair
// (mkcert's usual output names) if one has been generated locally, and falls
// back to plain HTTP otherwise rather than failing `vinext dev` on a clean
// checkout. Supabase's auth cookies are `Secure`, which browsers only send
// over HTTPS, so sign-in against local dev needs this at least once:
//   mkdir certificates && cd certificates && mkcert localhost
// (mkcert must be installed and its root CA trusted first: `mkcert -install`.)
const certDir = path.resolve(import.meta.dirname, "certificates");
const certPath = path.join(certDir, "localhost.pem");
const keyPath = path.join(certDir, "localhost-key.pem");
const https =
  existsSync(certPath) && existsSync(keyPath)
    ? { cert: readFileSync(certPath), key: readFileSync(keyPath) }
    : undefined;

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
      // cloudflare/scheduled.ts's `~/env` import fails to bundle (this entry
      // is built as part of the SAME Vite graph as the app, per
      // wrangler.jsonc's `main: "cloudflare/worker.ts"`, not compiled
      // separately by wrangler/esbuild the way the old OpenNext worker.js
      // re-export was). See apps/schedule-builder/vite.config.ts for the
      // identical reasoning.
      "~": path.resolve(import.meta.dirname, "src"),
    },
  },
  server: { https },
  // Off by default. deploy-app.yaml's `getsentry/action-release` step uploads
  // these from `dist/**` so Sentry can resolve stack traces, and
  // `public/.assetsignore` keeps the client ones out of the deployed assets.
  build: {
    sourcemap: true,
  },
});
