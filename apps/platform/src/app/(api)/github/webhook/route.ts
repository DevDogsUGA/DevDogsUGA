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
 * The live half of both mirrors this platform keeps against GitHub: the team
 * mirror (`server/github/webhookEvents.ts`) and the competitions mirror
 * (`server/github/competitionEvents.ts`), pushed here the moment either
 * changes rather than waited out until the nightly `github-reconcile` cron
 * notices. Six event types matter:
 *
 *   - `membership`: added/removed on a team's GitHub team.
 *   - `team`: the GitHub team deleted, or renamed.
 *   - `create` / `delete`: a `team/<slug>` branch appearing or vanishing.
 *   - `projects_v2_item`: a Competitions Project draft converted (kickoff)
 *     or a converted item's fields/content edited.
 *   - `issues`: closed, reopened or edited, for an issue this platform
 *     already mirrors as a competition.
 *
 * Each handler is idempotent against redelivery -- GitHub retries anything
 * that does not answer 2xx, so this always returns 200 once the signature
 * checks out, whether or not the event turned out to name something this
 * platform recognizes.
 *
 * `pull_request` is not handled here. Nothing here needs it yet -- PR-linked
 * competition ENTRY (as opposed to the competition mirror itself) is a later
 * step of the platform redesign -- so it falls through to the default case
 * below, acknowledged and ignored, the same as `ping`.
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
    case null:
    default:
      // `ping` (sent once, when the webhook is configured), `pull_request`,
      // and anything else this App is subscribed to that the team mirror
      // does not need -- `null` is a delivery with no `X-GitHub-Event`
      // header at all, which should not happen from GitHub itself. Every
      // case here is acknowledged rather than refused: an event this route
      // does not recognize is not a delivery failure.
      break;
  }

  return NextResponse.json({ ok: true });
}
