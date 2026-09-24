#!/usr/bin/env node
/**
 * Runs `@devdogsuga/devtools`'s `ci.ts` `main()` directly — no tier
 * resolution, no env-file loading — for the small set of deploy.yaml /
 * deploy-app.yaml steps that must NOT go through that resolution: `deploy
 * write-env` (which CREATES the env file tier-resolution would otherwise
 * insist on reading first — a bootstrap cycle) and the handful of steps that
 * hold one narrow credential via the job's own `env:` block and compose no
 * env file at all (`preflight`, `migrate`, `plan`, `require-planner`,
 * `require-token`, `orphans`). See deploy.yaml's own header for the full
 * argument; this script exists only to reach the entry point that argument
 * depends on.
 *
 * ## Why this script exists at all (a Backstage devtools gap, not a design choice)
 *
 * `@devdogsuga/devtools`'s in-repo `package.json` (Backstage
 * `packages/devtools/package.json`) has always had exactly this split: a
 * `"ci"` script (`node ./dist/ci.js`, no tier resolution) alongside `"ci:env"`
 * (`node ./bin/devtools-ci.mjs`, which resolves a tier and loads its env file
 * FIRST). Once installed as a published dependency, though, only two `bin`s
 * ship: `devtools` and `devtools-ci` — there is no bin for the bare, no-
 * tier-resolution entry point `"ci"` used to be. Confirmed empirically
 * (2026-09-24, against the `pnpm pack:local` tarball, version 0.1.0):
 * `pnpm exec devtools-ci deploy --tier development` («development» chosen
 * only to get PAST tier resolution) still prints
 * `devtools-ci: loaded .env.generated, .env (development)` to stderr before
 * dispatching — i.e. `devtools-ci` ALWAYS calls `enterEnvironment` before
 * running any `deploy` subcommand, with no flag to skip it. In a real
 * `deploy-app.yaml`/`deploy.yaml` job that composes no env file at all (the
 * `preflight`/`migrate`/`plan`/`require-planner`/`require-token`/`orphans`
 * jobs) or is in the middle of CREATING one (`write-env`), that call would
 * throw `MissingEnvFileError` before the step's own command ever ran.
 *
 * `dist/ci.js` (this script's target) IS shipped — it's `main()`'s home, and
 * `"files": ["bin", "dist"]` in devtools' package.json ships the whole `dist`
 * tree — but nothing in the published package points a `bin` at it directly.
 * Reported to whoever owns the Backstage carve-out rather than patched there
 * per this task's ground rules; this file is the interim bridge until
 * devtools ships a real no-env-resolution entry point (a third bin, or a
 * `devtools-ci --no-env`/`DEVTOOLS_CI_SKIP_ENV=1` escape hatch on the
 * existing one) — see the stage B report for the exact write-up.
 *
 * No `exports` map restricts `@devdogsuga/devtools`'s subpaths (only its
 * `bin` entries are a declared contract), so `dist/ci.js` resolves via plain
 * Node module resolution; `main` is exported from it (`export async function
 * main(argv: string[])`, `src/ci.ts` in Backstage). This wrapper imports and
 * calls it directly instead of invoking `dist/ci.js` as a subprocess entry
 * point, since its own self-invoke guard
 * (`import.meta.url === file://${process.argv[1]}`) only fires when it is
 * itself the process entry, which an `import()` from here never is.
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const target = require.resolve("@devdogsuga/devtools/dist/ci.js");
const { main } = await import(target);

try {
  await main(process.argv.slice(2));
} catch (err) {
  process.stderr.write(
    `devtools-ci-bare: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exitCode = 1;
}
