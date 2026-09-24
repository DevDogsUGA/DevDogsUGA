/*
 * Re-homed from packages/devtools/src/deploy/cli-dispatch.test.ts. Rewritten
 * as a black-box run of the INSTALLED bins ("devtools"/"devtools-ci" via
 * "pnpm exec") instead of spawning tsx against devtools' own src/cli.ts and
 * src/ci.ts — those source files aren't part of this repo any more once
 * packages/devtools is deleted; only the two published bins are.
 *
 * The property under test is one the in-process suites structurally cannot
 * see: that NOTHING DECORATIVE reaches the stdout of a "devtools-ci deploy"
 * step. A deploy job's stdout can be a credential channel (a value something
 * downstream parses whole), and a clack banner landing on that stream would
 * be an unmasked value in a public job log. Confirmed empirically
 * (2026-09-24, against the installed 0.1.0 tarball): "devtools-ci deploy"
 * prints nothing to stdout even for its own usage/error output — every line
 * goes to stderr via its say() helper.
 *
 * The positive control matters: if devtools' clack-wrapped commands ever
 * stopped printing a banner at ALL, every "stdout stayed empty" assertion
 * above would pass vacuously. "devtools cron list" (the plain contributor
 * CLI, not devtools-ci) wraps every dispatched command in a clack
 * intro()/outro() banner, confirmed to land on stdout — that's the property
 * devtools-ci is deliberately built NOT to have.
 */
import { describe, expect, it } from "vitest";
import { pnpmExec } from "./pnpm-exec.js";

// A cold process boot (pnpm exec resolving + node startup + devtools' own
// module graph) is slower than an ordinary unit test.
const SUBPROCESS_TIMEOUT = 15_000;

describe("devtools-ci deploy: stdout purity", () => {
  it(
    "prints nothing decorative to stdout, even for its own usage output",
    async () => {
      // No --tier / DEPLOY_ENV resolves: this deliberately exercises
      // "devtools-ci"'s tier-resolution refusal path (see deploy.yaml's
      // header for why "devtools-ci" always resolves a tier before
      // dispatching, and why "devtools-ci-bare" — the sibling bin exercised
      // below — exists for the steps that must not), which is itself one of
      // the messages that must stay off stdout.
      const result = await pnpmExec("devtools-ci", ["deploy"]);

      expect(result.stdout, "devtools-ci deploy stdout").toBe("");
      expect(result.stderr.length, "devtools-ci deploy stderr").toBeGreaterThan(
        0,
      );
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    "prints nothing decorative to stdout for a resolvable but unrecognized step",
    async () => {
      const result = await pnpmExec(
        "devtools-ci",
        ["deploy", "not-a-real-step"],
        {
          DEV_DB: "local",
        },
      );

      // Reaches ci.ts's own dispatch (tier resolution succeeded), which
      // refuses the unknown step name — still stderr-only.
      expect(result.stdout, "devtools-ci deploy not-a-real-step stdout").toBe(
        "",
      );
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    "devtools-ci-bare resolves no tier and loads no env file — --help works cold",
    async () => {
      // The published package's third bin (`@devdogsuga/devtools`'s
      // `bin/devtools-ci-bare.mjs` -> `dist/ci.js`'s `main()` directly, no
      // wrapper). Deploy steps that CREATE the env file (`write-env`) or
      // hold one narrow credential and compose no env file at all
      // (`preflight`, `migrate`, `plan`, `require-planner`, `require-token`,
      // `orphans`) run through this bin instead of `devtools-ci` — see
      // deploy.yaml's header. `--help` must succeed with no `--tier`, no
      // `DEPLOY_ENV`, and no `.env*` file present at all.
      const result = await pnpmExec("devtools-ci-bare", ["--help"]);

      // `ci.ts`'s `--help` branch writes to stdout deliberately (see its own
      // `main()`) — this is the command's own protocol output, not a
      // decorative clack banner, so it belongs on stdout. The property under
      // test is narrower: that it printed SOMETHING and exited zero without
      // ever needing a tier or an env file.
      expect(result.stdout, "devtools-ci-bare --help stdout").toContain(
        "deploy",
      );
      expect(result.code, "devtools-ci-bare --help exit code").toBe(0);
    },
    SUBPROCESS_TIMEOUT,
  );

  it(
    "positive control: devtools' own clack banner DOES land on stdout for an ordinary command",
    async () => {
      const result = await pnpmExec(
        "devtools",
        ["cron", "list", "--tier", "development:local", "--json"],
        { DEV_DB: "local" },
      );

      // The intro/outro box-drawing characters clack writes around every
      // dispatched (non---help) command.
      expect(result.stdout, "devtools cron list stdout").toMatch(/[┌└]/);
    },
    SUBPROCESS_TIMEOUT,
  );
});
