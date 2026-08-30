/**
 * Custom Cloudflare Worker entry; wrangler `main` points here. It re-exports the
 * OpenNext-generated `fetch` handler and any Durable Object classes the
 * generated worker exports, then adds the cron `scheduled` handler from
 * ./scheduled.
 *
 * `opennextjs-cloudflare build` produces `../.open-next/worker.js`, which is
 * gitignored and so does not exist at typecheck time. That is why tsconfig.json
 * "exclude" keeps this file out of `tsc`. wrangler/esbuild bundles it at build
 * time, where the generated import does resolve.
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
