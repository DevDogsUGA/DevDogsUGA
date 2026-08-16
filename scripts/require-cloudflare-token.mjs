/**
 * Refuses a Cloudflare deploy when `CLOUDFLARE_API_TOKEN` is absent.
 *
 * Without this, wrangler falls back to an interactive browser OAuth prompt —
 * which on a contributor's machine looks like an invitation to authenticate,
 * when the actual policy (design doc §9) is that only devops hold the token
 * and nobody else deploys. A named refusal beats a login flow that "works".
 *
 * Invocation shape, and why: every deploy script runs this INSIDE the same
 * `with-env -c '...'` string as the deploy itself, e.g.
 *
 *   DEPLOY_ENV=production with-env -c 'node ../../scripts/require-cloudflare-token.mjs && wrangler deploy -e production'
 *
 * The guard must run after with-env loads the env files — the token lives in
 * a devops `.env.production`, never in the ambient environment — so a plain
 * `guard && with-env deploy` would check the wrong environment, and a
 * `with-env guard && deploy` would drop the loaded env for the deploy itself.
 * `-c` gives both commands the same loaded env, and it evaluates through
 * @yarnpkg/shell, so the `&&` chain works identically on Windows and POSIX.
 *
 * `cf:build:*` scripts deliberately do NOT run this: building needs no token.
 */
if (!process.env.CLOUDFLARE_API_TOKEN) {
  console.error(
    "CLOUDFLARE_API_TOKEN is not set — refusing to deploy.\n" +
      "Cloudflare access is devops-only: ask the devops team to run this " +
      "deploy, or for the token if you are joining them " +
      "(it lives in the devops .env.production, via `env pull`).",
  );
  process.exit(1);
}
