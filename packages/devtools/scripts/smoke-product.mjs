#!/usr/bin/env node
// Smoke-runs the BUILT devtools bin the way a member does on their own
// machine: from a minimal product repository (just a devtools.config.json) and
// from a directory that is no repository at all, with no terminal attached.
// CI runs it on Windows, where every one of these once crashed (`spawn npx
// ENOENT`, a menu that needed a DevDogsUGA clone, `--version` unknown).
//
//   node scripts/smoke-product.mjs        (after `pnpm build`)
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const bin = fileURLToPath(new URL("../bin/devtools.mjs", import.meta.url));
const PIN = "2.122.0";

const product = mkdtempSync(join(tmpdir(), "devtools-smoke-product-"));
const nowhere = mkdtempSync(join(tmpdir(), "devtools-smoke-empty-"));
writeFileSync(
  join(product, "devtools.config.json"),
  JSON.stringify({
    product: "smoke",
    name: "Smoke",
    supabase: { version: PIN, schemas: ["smoke"] },
    types: { kind: "typescript", out: "src/database.types.ts" },
  }),
);

let failed = 0;
function run(label, cwd, args, expect) {
  const result = spawnSync(process.execPath, [bin, ...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 300_000,
    env: { ...process.env, DEVTOOLS_TELEMETRY: "0", NO_COLOR: "1" },
  });
  const output = `${result.stdout}${result.stderr}`;
  const problems = [];
  if (result.error) problems.push(`did not run: ${result.error.message}`);
  if (result.status !== (expect.status ?? 0)) {
    problems.push(`exit ${result.status}, wanted ${expect.status ?? 0}`);
  }
  for (const text of expect.includes ?? []) {
    if (!output.includes(text)) problems.push(`output lacks ${text}`);
  }
  for (const text of expect.excludes ?? []) {
    if (output.includes(text)) problems.push(`output has ${text}`);
  }
  if (problems.length > 0) {
    failed += 1;
    console.error(`FAIL  ${label}: ${problems.join("; ")}\n${output}`);
  } else {
    console.log(`ok    ${label}`);
  }
}

const NO_CRASH = ["RepoNotFoundError", "ENOENT", "    at "];

run("product: --version", product, ["--version"], {
  includes: ["."],
  excludes: NO_CRASH,
});
run("product: --help", product, ["--help"], {
  includes: ["setup", "db sync"],
  excludes: NO_CRASH,
});
run("product: bare devtools, no terminal", product, [], {
  includes: ["setup", "dev-data"],
  excludes: NO_CRASH,
});
// Starts `pnpm dlx` (pnpm is a .cmd shim on Windows) to fetch and run the
// Supabase CLI at the product's pin.
run(
  "product: supabase --version spawns pnpm dlx",
  product,
  ["supabase", "--version"],
  {
    includes: [PIN],
    excludes: NO_CRASH,
  },
);
run("anywhere: --version", nowhere, ["--version"], { excludes: NO_CRASH });
run("anywhere: --help", nowhere, ["--help"], { excludes: NO_CRASH });
run(
  "anywhere: a checkout-only command is refused in a sentence",
  nowhere,
  ["db", "status"],
  {
    status: 1,
    includes: ["`devtools db status` needs a DevDogsUGA clone"],
    excludes: ["    at ", "monorepo root"],
  },
);

rmSync(product, { recursive: true, force: true });
rmSync(nowhere, { recursive: true, force: true });
if (failed > 0) {
  console.error(`${failed} smoke check(s) failed.`);
  process.exit(1);
}
