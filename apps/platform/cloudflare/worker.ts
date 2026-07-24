/**
 * Custom Cloudflare Worker entry (wrangler `main` points here). Re-exports the
 * OpenNext-generated `fetch` handler — plus any Durable Object classes the
 * generated worker exports — and adds the cron `scheduled` handler from
 * ./scheduled.
 *
 * `../.open-next/worker.js` is produced by `opennextjs-cloudflare build` and is
 * gitignored, so it does not exist at typecheck time. This file is therefore
 * excluded from `tsc` (see tsconfig.json "exclude") and bundled by
 * wrangler/esbuild at build time, which resolves the generated import.
 */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import openNextHandler from "../.open-next/worker.js";
import { scheduled } from "./scheduled";

export * from "../.open-next/worker.js";

export default {
  ...openNextHandler,
  scheduled: (event, env) => scheduled(event, env),
};
