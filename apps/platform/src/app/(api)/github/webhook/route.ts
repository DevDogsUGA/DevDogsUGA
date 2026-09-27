import { NextResponse } from "next/server";
import { env } from "~/env";
import { db } from "~/server/db";
import {
  handleCompetitionIssueEvent,
  handleProjectsV2ItemEvent,
  type CompetitionIssueEventPayload,
  type ProjectsV2ItemEventPayload,
} from "~/server/github/competitionEvents";
import {
  handlePullRequestEvent,
  type PullRequestEventPayload,
} from "~/server/github/prEvent";
import {
  handleMembershipEvent,
  handleRefEvent,
  handleTeamEvent,
  type MembershipEventPayload,
  type RefEventPayload,
  type TeamEventPayload,
} from "~/server/github/webhookEvents";
import { verifyGithubSignature } from "~/server/github/webhookSignature";

/**
 * POST /github/webhook
 *
 * The live half of the three mirrors this platform keeps against GitHub:
 * the team mirror (`server/github/webhookEvents.ts`), the competitions
 * mirror (`server/github/competitionEvents.ts`) and the competition-entries
 * mirror (`server/github/prEvent.ts`), pushed here the moment any of them
 * changes rather than waited out until the nightly `github-reconcile` cron
 * notices. Seven event types matter:
 *
 *   - `membership`: added/removed on a team's GitHub team.
 *   - `team`: the GitHub team deleted, or renamed.
 *   - `create` / `delete`: a `team/<slug>` branch appearing or vanishing.
 *   - `projects_v2_item`: a Competitions Project draft converted (kickoff)
 *     or a converted item's fields/content edited.
 *   - `issues`: closed, reopened or edited, for an issue this platform
 *     already mirrors as a competition.
 *   - `pull_request`: opened, edited, reopened or closed -- a team-branch PR
 *     entering (or leaving, or winning) a competition.
 *
 * Each handler is idempotent against redelivery -- GitHub retries anything
 * that does not answer 2xx, so this always returns 200 once the signature
 * checks out, whether or not the event turned out to name something this
 * platform recognizes.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();

  // Same dev-bypass shape as the cron routes' bearer check: signature
  // verification only runs deployed, so `next dev` can exercise this route
  // with a `curl` payload and no real App webhook secret configured.
  if (
    process.env.DEPLOY_ENV &&
    process.env.DEPLOY_ENV !== "development" &&
    !(await verifyGithubSignature(
      env.GH_WEBHOOK_SECRET,
      rawBody,
      request.headers.get("x-hub-signature-256"),
    ))
  ) {
    return new NextResponse("Bad signature", { status: 401 });
  }

  const event = request.headers.get("x-github-event");
  const payload: unknown = rawBody.length > 0 ? JSON.parse(rawBody) : {};

  switch (event) {
    case "membership":
      await handleMembershipEvent(db, payload as MembershipEventPayload);
      break;
    case "team":
      await handleTeamEvent(db, payload as TeamEventPayload);
      break;
    case "create":
      await handleRefEvent(db, "create", payload as RefEventPayload);
      break;
    case "delete":
      await handleRefEvent(db, "delete", payload as RefEventPayload);
      break;
    case "projects_v2_item":
      await handleProjectsV2ItemEvent(
        db,
        payload as ProjectsV2ItemEventPayload,
      );
      break;
    case "issues":
      await handleCompetitionIssueEvent(
        db,
        payload as CompetitionIssueEventPayload,
      );
      break;
    case "pull_request":
      await handlePullRequestEvent(db, payload as PullRequestEventPayload);
      break;
    case null:
    default:
      // `ping` (sent once, when the webhook is configured), and anything
      // else this App is subscribed to that no mirror here needs -- `null`
      // is a delivery with no `X-GitHub-Event` header at all, which should
      // not happen from GitHub itself. Every case here is acknowledged
      // rather than refused: an event this route does not recognize is not
      // a delivery failure.
      break;
  }

  return NextResponse.json({ ok: true });
}
