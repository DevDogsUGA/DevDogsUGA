#!/usr/bin/env node
/**
 * Wrangler custom-build hook for the repo's OpenNext apps.
 *
 * Their checked-in entry point imports `.open-next/worker.js` and their assets
 * binding names `.open-next/assets`, neither of which exists in a clean clone.
 * OpenNext's own build/deploy scripts usually create those first, but a direct
 * `wrangler dev` does not. This hook makes the Wrangler config self-sufficient
 * while avoiding a second build when preview or CI just produced the artifact.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

// Wrangler also invokes custom builds while generating binding types. That
// command reads the configuration only and does not need an OpenNext artifact.
if (process.env.WRANGLER_COMMAND === "types") {
  process.stdout.write(
    "Skipping the OpenNext build for Wrangler type generation.\n",
  );
  process.exit(0);
}

const appRoot = process.cwd();
const worker = join(appRoot, ".open-next", "worker.js");
const assets = join(appRoot, ".open-next", "assets");
const inputs = [
  "src",
  "cloudflare",
  "public",
  "next.config.ts",
  "open-next.config.ts",
  "package.json",
  "wrangler.jsonc",
].map((path) => join(appRoot, path));

function newestMtime(path) {
  if (!existsSync(path)) return 0;
  const stat = statSync(path);
  if (!stat.isDirectory()) return stat.mtimeMs;
  return readdirSync(path, { withFileTypes: true }).reduce(
    (newest, entry) => Math.max(newest, newestMtime(join(path, entry.name))),
    stat.mtimeMs,
  );
}

const artifactIsFresh =
  existsSync(worker) &&
  existsSync(assets) &&
  statSync(worker).mtimeMs >= Math.max(...inputs.map(newestMtime));

if (artifactIsFresh) {
  process.stdout.write("OpenNext output is current; reusing it.\n");
  process.exit(0);
}

process.stdout.write(
  "OpenNext output is missing or stale; building it before Wrangler starts.\n",
);
const result = spawnSync(
  "pnpm",
  ["exec", "with-env", "opennextjs-cloudflare", "build"],
  {
    cwd: appRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
  },
);
process.exit(result.status ?? 1);
