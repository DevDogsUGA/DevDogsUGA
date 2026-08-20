#!/usr/bin/env node
// A COMMITTED shim, and its existence at install time is the whole point.
// The bin used to point straight at ./dist/cli.js, which does not exist on a
// fresh checkout — and pnpm silently skips linking a bin whose target file is
// missing, so CI's first-ever run failed with a bare exit 127 ("docs-build:
// command not found") while every laptop with a stale dist/ worked fine.
// This file always exists, so the link always exists; by the time anything
// RUNS it, turbo's `^build` ordering has compiled dist/.
import "../dist/cli.js";
