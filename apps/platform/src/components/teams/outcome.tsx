import Link from "next/link";
import type { TeamProblemCode } from "~/server/teams/errors";
import Callout from "~/ui/callout";

/**
 * The team actions' failures, said out loud.
 *
 * `src/server/actions/teams.ts` converts a thrown `TeamActionError` into
 * `{ ok: false, code }` at the boundary where every action is exported. See the
 * note there for why it cannot be left to each page. What is left here is the
 * half that belongs to the UI: which sentence each code becomes.
 */

/**
 * One sentence per code.
 *
 * Typed as a total record over the union on purpose. Adding a code to
 * `TeamActionCode` breaks the build HERE rather than silently rendering an
 * empty paragraph to whoever hits the new failure first. That is not
 * hypothetical. `name_taken` was added to the union and this table caught it.
 */
export const TEAM_PROBLEM_MESSAGES: Record<TeamProblemCode, string> = {
  github_not_linked:
    "Joining a team provisions your access to the team's repository branch, so your GitHub account has to be linked first.",
  github_unavailable:
    "GitHub did not apply this. Nothing was saved — try again in a moment.",
  team_full: "That team is already at its member limit.",
  too_many_teams:
    "You are already active on as many teams as one contributor can be on at once.",
  already_on_team: "You are already on that team.",
  not_a_member: "You are not on that team.",
  not_the_lead: "Only the team's lead can do that.",
  lead_must_transfer_first:
    "You lead this team, so pass the lead to somebody else before you leave.",
  bad_join_code:
    "That join code does not match. Codes are six characters; spacing and capitals do not matter.",
  request_not_actionable:
    "This one is no longer open — it has been answered or withdrawn already.",
  name_taken: "Another team already has that name. Pick a different one.",
  not_found: "That team or request no longer exists.",
  unknown:
    "Something went wrong on our side and nothing was saved. Try again in a moment.",
};

/**
 * The failure, said out loud.
 *
 * `github_not_linked` is the only one with somewhere to go, and it gets the
 * link. It is the most likely first-join failure, since nothing before this
 * point in the platform requires GitHub, and "link your account" without a
 * route to do it in is an instruction to go hunting.
 *
 * `alert` because every one of these answers a button the reader just pressed,
 * which is exactly the case the flag is for.
 */
export function TeamProblem({ code }: { code: TeamProblemCode }) {
  return (
    <Callout tone="critical" alert>
      {TEAM_PROBLEM_MESSAGES[code]}
      {code === "github_not_linked" && (
        <>
          {" "}
          <Link href="/account" className="underline">
            Link GitHub on your account
          </Link>
          .
        </>
      )}
    </Callout>
  );
}
