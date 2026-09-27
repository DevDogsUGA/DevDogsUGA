import { env } from "~/env";
import { octokit } from "./client";

/**
 * Two-factor authentication, read from GitHub's own idea of it.
 *
 * Team membership grants push access to `GITHUB_ORG`'s competition repo (see
 * `teamSync.ts`'s module doc), so this gates every action that grants or
 * requests it: `createTeam`, `joinTeam`, `requestToJoin`, and the accepting
 * half of `respondToMembership`. Checked against the org's own 2FA
 * enforcement rather than anything this platform stores, because nothing
 * this platform stores can tell whether a member turned 2FA off after
 * linking their account.
 *
 * ## The two lists, and why both
 *
 * `GET /orgs/{org}/members?filter=2fa_disabled` is the org-membership half.
 * `GET /orgs/{org}/outside_collaborators?filter=2fa_disabled` is the other
 * half: a contributor can be added to a GitHub team (and, through it, to a
 * repository) without being an org MEMBER at all -- an outside collaborator
 * -- and that list is where GitHub reports 2FA for those accounts. A login
 * absent from both is read as 2FA-enabled; there is no third list to check.
 *
 * ## `filter=2fa_disabled` is an owner-only view
 *
 * GitHub's docs reserve it for organization owners. This platform authenticates
 * as the DevDogs GitHub App's installation (`client.ts`), not as an owner, so
 * the installation needs the **"Organization members: read"** permission
 * granted for this filter to resolve rather than 403. If it 403s, that is a
 * permission gap to fix on the App's installation, not a bug here -- see
 * `describeUnverifiable` below for how that reaches the caller.
 *
 * ## Fail-closed, except locally
 *
 * A team-membership grant is push access to the org's repository, so a GitHub
 * call this platform CANNOT complete is treated as "cannot confirm 2FA is on",
 * not as "assume it is". The one exception is local development with no real
 * GitHub App behind `octokit()` -- `env.DEPLOY_ENV === "development"` is the
 * same signal `server/email/send.ts` uses to tell "this gap is expected
 * outside a deployed Worker" from "this deployed Worker is silently failing
 * every send", and it means the same thing here: a contributor running
 * `next dev` (or a test) against a placeholder `GH_APP_ID` should not be
 * locked out of every team action because the App cannot reach GitHub.
 */

const CACHE_MS = 30_000;

/**
 * Both disabled-login lists, lowercased and merged into one set.
 *
 * Cached briefly and per PROCESS, not per request -- a handful of team
 * actions can land in the same few seconds (an invite fan-out, a page of
 * requests being answered), and each is one more pair of paginated org-wide
 * reads for the same answer. Thirty seconds is short enough that a member
 * who fixes their 2FA and immediately retries is not stuck behind a stale
 * "disabled" answer for meaningfully long, and long enough to collapse a
 * burst.
 */
let cache: { at: number; disabled: Set<string> } | null = null;

async function fetchDisabledLogins(): Promise<Set<string>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.disabled;

  const api = octokit();
  const disabled = new Set<string>();

  const members = await api.paginate(api.rest.orgs.listMembers, {
    org: env.GITHUB_ORG,
    filter: "2fa_disabled",
    per_page: 100,
  });
  for (const member of members) disabled.add(member.login.toLowerCase());

  const outsideCollaborators = await api.paginate(
    api.rest.orgs.listOutsideCollaborators,
    { org: env.GITHUB_ORG, filter: "2fa_disabled", per_page: 100 },
  );
  for (const collaborator of outsideCollaborators) {
    disabled.add(collaborator.login.toLowerCase());
  }

  cache = { at: Date.now(), disabled };
  return disabled;
}

export type TwoFactorStatus =
  /** Not in either `2fa_disabled` list: GitHub reports 2FA is on. */
  | "enabled"
  /** Listed as `2fa_disabled` in one of the two lists. */
  | "disabled"
  /** The GitHub call itself failed. Fail-closed for the caller to act on --
   *  see this module's doc on why "unknown" is not treated as "enabled". */
  | "unverifiable";

// Same "announce once" shape as `send.ts`'s `announceMissing`: this can be
// asked once per team action, and repeating the same warning on every one of
// them trains people to stop reading it.
let announcedDevBypass = false;

/**
 * Whether a GitHub login has 2FA on, per the org's own enforcement.
 *
 * `"unverifiable"` in every deployed environment when the GitHub call fails,
 * `"enabled"` for that same failure in local development -- see this
 * module's doc. Never throws; the caller (`requireTwoFactor`) is what turns
 * a status into a refusal.
 */
export async function twoFactorStatus(login: string): Promise<TwoFactorStatus> {
  try {
    const disabled = await fetchDisabledLogins();
    return disabled.has(login.toLowerCase()) ? "disabled" : "enabled";
  } catch (error) {
    if (env.DEPLOY_ENV === "development") {
      if (!announcedDevBypass) {
        announcedDevBypass = true;
        console.info(
          "github 2FA check: skipped -- could not reach GitHub " +
            `(${describe(error)}), treated as passing (expected outside a ` +
            "deployed Worker). Further skips are silent.",
        );
      }
      return "enabled";
    }
    console.error("github 2FA check failed:", describe(error));
    return "unverifiable";
  }
}

function describe(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}
