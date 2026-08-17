/**
 * `pnpm devtools deploy require-token`
 *
 * Refuses a Cloudflare deploy when `CLOUDFLARE_API_TOKEN` is absent.
 *
 * Without this, wrangler falls back to an interactive browser OAuth prompt —
 * which on a contributor's machine looks like an invitation to authenticate,
 * when the actual policy (design doc §9) is that only devops hold the token
 * and nobody else deploys. A named refusal beats a login flow that "works".
 *
 * ## ⚠️ Invoke it through `cli:no-env`, never through `cli`
 *
 * This is a GUARD, not a command anybody types. It runs in two shapes, and
 * `cli` — which is `with-env tsx src/cli.ts` — is wrong for both:
 *
 *   * **Inside the deploy's own `with-env -c '...'` string**, in
 *     `apps/{platform,schedule-builder,sandbox}/package.json`:
 *
 *       DEPLOY_ENV=production with-env -c '<guard> && wrangler deploy -e production'
 *
 *     The guard must run after with-env loads the env files — the token lives
 *     in a devops `.env.production`, never in the ambient environment — so a
 *     plain `guard && with-env deploy` would check the wrong environment, and a
 *     `with-env guard && deploy` would drop the loaded env for the deploy
 *     itself. `-c` gives both commands the same loaded env, and it evaluates
 *     through @yarnpkg/shell, so the `&&` chain works identically on Windows
 *     and POSIX. The env is therefore ALREADY LOADED by the time the guard
 *     runs; a second `with-env` inside it re-loads the same files to no effect
 *     and prints a second `with-env: loaded ...` line, which makes the deploy
 *     log claim the environment was selected twice.
 *
 *   * **Bare, in CI**, in the orphan-audit and prune jobs — which run with no
 *     env file at all, on purpose (they read secret NAMES from Cloudflare and
 *     need exactly one credential to do it). This is the shape that makes
 *     `cli` an outright bug rather than an untidiness: with no `.env*` present,
 *     `with-env` raises `MissingEnvFileError` and exits 1 BEFORE this code
 *     runs. The guard would refuse the deploy while reporting a missing file
 *     instead of a missing token — the wrong diagnosis, on the failure path,
 *     which is the only path anybody reads.
 *
 * `cli:no-env` (`tsx --conditions=development src/cli.ts`) is the seam for
 * both: it loads no env of its own and reads whatever the caller already put
 * in `process.env`, which is exactly the guard's contract. Verified by running
 * `pnpm --filter @devdogsuga/devtools run cli:no-env` inside a real
 * `with-env -c` string: it resolves through @yarnpkg/shell and adds no second
 * env-selection line.
 *
 * For the record, nesting `with-env` is otherwise HARMLESS — dotenvx leaves
 * values already in the environment alone, so the inner load re-reads the same
 * files and changes nothing. The objection is the missing-file case above and
 * the duplicated `with-env: loaded ...` line, not a wrong value.
 *
 * `cf:build:*` scripts deliberately do NOT run this: building needs no token.
 */
import { DeployError } from "./report.js";

/**
 * Silent on success, on purpose: it stands in front of a deploy inside an
 * `&&` chain, and a guard that announces itself on every run is a guard people
 * stop reading. The refusal is the only thing it has to say.
 *
 * It refuses by throwing rather than by returning a code so that `cli.ts`
 * renders it exactly like every other deploy failure — through `say()`, which
 * is stderr, never `explain()`, which is clack and therefore stdout.
 *
 * @throws {DeployError} when `CLOUDFLARE_API_TOKEN` is absent or empty.
 */
export function runRequireToken(
  env: Record<string, string | undefined> = process.env,
): void {
  if (env.CLOUDFLARE_API_TOKEN) return;

  throw new DeployError(
    "CLOUDFLARE_API_TOKEN is not set — refusing to deploy.",
    [
      "Cloudflare access is devops-only (design doc §9). Without this guard",
      "wrangler falls back to an interactive browser login, which looks like",
      "an invitation to authenticate rather than the refusal it should be.",
      "",
      "Ask the devops team to run this deploy. If you are joining them, the",
      "token lives in the devops .env.production:",
      "  pnpm devtools env pull --target production",
    ],
  );
}
