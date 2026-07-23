#!/usr/bin/env node
// Loads the monorepo env chain, then execs a command in the caller's cwd.
//
// Usage:
//   with-env <command> [args...]           # remote-first: caller .env.local -> root .env
//   with-env --local <command> [args...]   # + root .env.supabase (local stack creds)
//
// Env precedence is FIRST-WINS: a variable set by an earlier file is never
// overwritten by a later one. Order (remote): caller ./.env.local, root .env.
// Order (--local): caller ./.env.local, root .env.supabase, root .env.
// The command runs in the caller's cwd so tools like `supabase` still find
// their ./supabase/config.toml.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { config } from "dotenv";
import { expand } from "dotenv-expand";

const args = process.argv.slice(2);
let local = false;
if (args[0] === "--local") {
  local = true;
  args.shift();
}

if (args.length === 0) {
  console.error("with-env: no command given");
  process.exit(1);
}

/** Walk up from `start` until a directory contains pnpm-workspace.yaml. */
function findRepoRoot(start) {
  let dir = start;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return start; // reached fs root; fall back
    dir = parent;
  }
}

const cwd = process.cwd();
const root = findRepoRoot(cwd);

const files = [
  join(cwd, ".env.local"),
  ...(local ? [join(root, ".env.supabase")] : []),
  join(root, ".env"),
];

for (const path of files) {
  if (existsSync(path)) {
    // override:false => first file to set a var wins.
    expand(config({ path, override: false, quiet: true }));
  }
}

const [command, ...rest] = args;
const result = spawnSync(command, rest, {
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});

if (result.error) {
  console.error(`with-env: failed to run "${command}": ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
