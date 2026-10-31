/**
 * Release gate for the commit sync (D0 section 8.7): confirms the read-only
 * App's DevDogsUGA installation token can read PUBLIC repos outside the org,
 * the way an Actions `GITHUB_TOKEN` can, and that the org inventory works.
 * Nobody without the App's private key can run it; if any line fails, stop
 * and report, and do not add a `GH_PUBLIC_READ_TOKEN` without asking.
 *
 *   GH_APP_ID=... GH_APP_PRIVATE_KEY="$(cat key.pem)" \
 *     pnpm exec tsx scripts/verify-github-public-read.ts
 *
 * It goes through the same transport as the sync, so it also proves the
 * `/orgs/DevDogsUGA/installation` handshake and the read-only token request.
 * It makes about a dozen requests, prints no credential and touches no
 * database. Exit code 1 when any check fails.
 */
import { GithubClient, newBudget } from "../src/server/github/transport";

const appId = process.env.GH_APP_ID;
const privateKey = process.env.GH_APP_PRIVATE_KEY;
if (!appId || !privateKey) {
  console.error("Set GH_APP_ID and GH_APP_PRIVATE_KEY (the read-only App).");
  process.exit(2);
}

const api = new GithubClient({ appId, privateKey });
const budget = newBudget();

// octocat/Hello-World is public, owned by a user, outside DevDogsUGA.
// torvalds/linux is public and owned by a different user. Neither is ours.
const checks: [string, string][] = [
  ["external repo by name", "/repos/octocat/Hello-World"],
  ["external repo by numeric id", "/repositories/1296269"],
  [
    "external default-branch commits",
    "/repos/octocat/Hello-World/commits?per_page=1",
  ],
  ["external user by numeric id", "/user/583231"],
  ["second external repo", "/repos/torvalds/linux"],
  ["org public inventory", "/orgs/DevDogsUGA/repos?type=public&per_page=1"],
  ["DevDogsUGA repo by numeric id", "/repositories/792882166"],
];

let failed = 0;
for (const [label, path] of checks) {
  const result = await api.githubFetch<unknown>(path, budget);
  if (result.ok) console.log(`PASS  ${label}`);
  else {
    failed++;
    console.log(`FAIL  ${label}: ${result.kind} (${result.message})`);
  }
}

const external = await api.githubFetch<{ private: boolean }>(
  "/repos/octocat/Hello-World",
  budget,
);
if (external.ok && external.data.private) {
  failed++;
  console.log("FAIL  the external fixture repo reported itself private");
}

console.log(
  `\n${budget.requests} requests. ` +
    (failed === 0
      ? "The installation token reads public repos outside the org: no public-read credential is needed."
      : `${failed} check(s) failed: the token cannot do the sync's reads as configured.`),
);
process.exitCode = failed === 0 ? 0 : 1;
