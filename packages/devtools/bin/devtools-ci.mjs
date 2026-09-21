#!/usr/bin/env node
/**
 * Plain-Node bootstrap for the `devtools-ci` bin. Same technique as
 * `bin/devtools.mjs` — see that file's header — pointed at
 * `src/launch-ci.ts` instead.
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
      "devtools-ci: cannot find tsx — run `pnpm install` at the repo root.",
    );
    process.exit(1);
  }
  const entry = typeof bin === "string" ? bin : bin?.tsx;
  if (!entry) {
    console.error(
      "devtools-ci: tsx's package.json has no usable bin entry — run `pnpm install` again.",
    );
    process.exit(1);
  }
  return join(dirname(pkgPath), entry);
}

const launchEntry = fileURLToPath(
  new URL("../src/launch-ci.ts", import.meta.url),
);

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

child.on("error", (err) => {
  console.error(`devtools-ci: ${err.message}`);
  process.exit(1);
});
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
