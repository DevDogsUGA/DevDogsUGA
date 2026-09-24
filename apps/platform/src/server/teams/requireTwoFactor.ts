import { githubLoginFor } from "~/server/github/teamSync";
import { twoFactorStatus } from "~/server/github/twoFactor";
import { TeamActionError } from "./errors";

/**
 * Refuses an action that would grant (or ask for) push access to the org's
 * competition repo unless the caller's linked GitHub account has 2FA on.
 *
 * Called from every action that grants membership or files a request for it:
 * `createTeam`, `joinTeam`, `requestToJoin`, and the accepting half of
 * `respondToMembership` -- see `server/github/twoFactor.ts`'s module doc for
 * why membership is the thing being gated.
 *
 * A no-op when the account has no linked GitHub identity at all. That is a
 * DIFFERENT refusal -- `github_not_linked`, raised where each action already
 * raises it (`requireCanJoin`, or a `GithubResult` from `addMember` /
 * `provisionTeam`) -- and this function has no business turning "never
 * linked GitHub" into "2FA is off", which would send somebody to the wrong
 * page to fix it.
 */
export async function requireTwoFactor(userId: string): Promise<void> {
  const login = await githubLoginFor(userId);
  if (!login) return;

  const status = await twoFactorStatus(login);
  if (status === "disabled") {
    throw new TeamActionError("github_2fa_required");
  }
  if (status === "unverifiable") {
    throw new TeamActionError("github_2fa_unverifiable");
  }
}
