#!/usr/bin/env node
/**
 * Plain-Node bootstrap for the `devtools` bin, so `pnpm devtools` works from
 * ANY directory — not just `packages/devtools` — the same way any other
 * workspace bin does, with no `with-env` wrapper in front of it (see
 * `src/launch.ts`, which replaces that wrapper's job).
 *
 * Deliberately plain JavaScript, not TypeScript: this file's whole purpose is
 * to resolve `tsx` and hand off to it, so it has to run before `tsx` itself
 * is available. It mirrors `packages/env/src/cli.ts`'s `dotenvxCli()`
 * technique — resolving a dependency's CLI entry through THIS package's own
 * `node_modules` via `createRequire`, rather than trusting `tsx` to be on
 * `PATH` or spawning its `.bin` shim directly (which Node refuses for a
 * `.cmd` shim without a shell since CVE-2024-27980 — see that file's own
 * comment on the point).
 *
 * `--conditions=devdogs-source` is what makes every `@devdogsuga/*` import
 * resolve to that package's TypeScript source rather than a `dist/` this
 * repo does not build for local development — the same flag the `cli` script
 * always passed to `tsx` directly.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

function tsxCliEntry() {
  let pkgPath;
  let bin;
  try {
    pkgPath = require.resolve("tsx/package.json");
    ({ bin } = require("tsx/package.json"));
  } catch {
    console.error(
      "devtools: cannot find tsx — run `pnpm install` at the repo root.",
    );
    process.exit(1);
  }
  const entry = typeof bin === "string" ? bin : bin?.tsx;
  if (!entry) {
    console.error(
      "devtools: tsx's package.json has no usable bin entry — run `pnpm install` again.",
    );
    process.exit(1);
  }
  return join(dirname(pkgPath), entry);
}

const launchEntry = fileURLToPath(new URL("../src/launch.ts", import.meta.url));

const child = spawn(
  process.execPath,
  [
    tsxCliEntry(),
    "--conditions=devdogs-source",
    launchEntry,
    ...process.argv.slice(2),
  ],
  { stdio: "inherit" },
);

// Forwarding a child's exit exactly as `with-env` does (see
// `packages/env/bin/with-env.mjs`), so this bootstrap is transparent: a
// signal that killed the child kills this process the same way, and an
// ordinary exit code passes straight through.
child.on("error", (err) => {
  console.error(`devtools: ${err.message}`);
  process.exit(1);
});
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
