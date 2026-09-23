import { and, eq, isNull } from "drizzle-orm";
import type { db } from "~/server/db";
import { teamMembers, teams } from "~/server/db/schema";
import { postAlert } from "../alerts";
import { platformSlugFromGithubTeamSlug, teamSlugFromBranch } from "./naming";
import { userIdForGithubLogin } from "./teamSync";

/**
 * The live half of the team mirror: one handler per GitHub event that
 * changes team state, called from `/github/webhook` after the signature is
 * verified.
 *
 * Every handler here takes `database: typeof db` rather than closing over
 * the module-level `db`, the same seam `server/config/reconcile.ts` uses --
 * Workflow-safe, and a db-test can run these against a real database without
 * touching the network, since none of them call GitHub at all. That is
 * deliberate: everything a handler needs to update the mirror correctly
 * arrives IN the payload GitHub already sent. Reaching back out to the API
 * from inside a webhook handler would turn a signed, already-true event into
 * a second, independently-fallible read of the same fact.
 *
 * Every handler is idempotent, because GitHub retries a delivery that does
 * not answer 2xx, and a redelivered event must land the mirror in the same
 * place it did the first time, not apply itself twice. Every handler also
 * ignores a team or branch it does not recognize rather than erroring: the
 * App's permissions can produce events for repository state this platform
 * never provisioned (someone else's branch, a team this club never made),
 * and refusing one of those would fail a legitimate delivery for a reason
 * that has nothing to do with the team mirror.
 */

interface WebhookTeamRef {
  /** GitHub's own team slug, e.g. `"team-sicem"`. */
  slug: string;
  name: string;
}

export interface MembershipEventPayload {
  action: "added" | "removed";
  scope: string;
  member: { login: string };
  team: WebhookTeamRef;
}

export interface TeamEventPayload {
  action: string;
  team: WebhookTeamRef;
  changes?: { name?: { from: string } };
}

export interface RefEventPayload {
  ref: string;
  ref_type: "branch" | "tag";
}

async function teamRowFor(database: typeof db, platformSlug: string) {
  const [row] = await database
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.slug, platformSlug))
    .limit(1);
  return row ?? null;
}

async function markSynced(database: typeof db, teamId: string): Promise<void> {
  await database
    .update(teams)
    .set({ githubSyncedAt: new Date() })
    .where(eq(teams.id, teamId));
}

/**
 * `membership`: a member added to or removed from a team's GitHub team.
 *
 * Only `scope: "team"` events are ours -- GitHub also fires `membership` for
 * organization-level membership changes this platform does not mirror.
 * Redelivery-safe by construction: "added" checks for an active row before
 * inserting one, and "removed" only closes a row that is still active, so
 * applying either twice is a no-op the second time.
 */
export async function handleMembershipEvent(
  database: typeof db,
  payload: MembershipEventPayload,
): Promise<void> {
  if (payload.scope !== "team") return;

  const platformSlug = platformSlugFromGithubTeamSlug(payload.team.slug);
  if (platformSlug === null) return;

  const team = await teamRowFor(database, platformSlug);
  if (!team) return;

  // A GitHub login the platform cannot attribute to an account. Not this
  // handler's problem to solve -- it cannot write a mirror row with no
  // `userId` to put in it -- and not necessarily a stranger either: a member
  // who authenticated some other way and never linked GitHub looks
  // identical from here. The nightly reconcile reports this same gap to
  // Sentry as `unmatched`; a single missed webhook delivery for it is not
  // worth a second alert.
  const userId = await userIdForGithubLogin(payload.member.login);
  if (userId === null) return;

  if (payload.action === "added") {
    const [active] = await database
      .select({ id: teamMembers.id })
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.teamId, team.id),
          eq(teamMembers.userId, userId),
          isNull(teamMembers.leftAt),
        ),
      )
      .limit(1);
    if (!active) {
      await database
        .insert(teamMembers)
        .values({ teamId: team.id, userId, role: "member" });
    }
  } else if (payload.action === "removed") {
    await database
      .update(teamMembers)
      .set({ leftAt: new Date() })
      .where(
        and(
          eq(teamMembers.teamId, team.id),
          eq(teamMembers.userId, userId),
          isNull(teamMembers.leftAt),
        ),
      );
  }

  await markSynced(database, team.id);
}

/**
 * `team`: the GitHub team backing a mirror row was deleted, or edited.
 *
 * Only `deleted` and a name-changing `edited` matter here; every other
 * action (`created`, a description edit, a privacy change) leaves nothing
 * for the mirror to update and is ignored.
 */
export async function handleTeamEvent(
  database: typeof db,
  payload: TeamEventPayload,
): Promise<void> {
  const platformSlug = platformSlugFromGithubTeamSlug(payload.team.slug);
  if (platformSlug === null) return;

  if (payload.action === "deleted") {
    // The GitHub team is gone, so the mirror's own source of truth for this
    // team just disappeared. Deleting the row here cascades `teamMembers`
    // and any pending `teamMembershipRequests`, same as `disbandTeamAction`
    // -- and if THIS delivery is what a disband already caused (that action
    // deletes the GitHub team before its own mirror delete), this is a
    // redelivery-safe no-op the moment the action's own delete has landed.
    await database.delete(teams).where(eq(teams.slug, platformSlug));
    return;
  }

  if (payload.action === "edited" && payload.changes?.name !== undefined) {
    // Every GitHub call this platform makes addresses a team BY the slug
    // `naming.ts` derives from the platform's own slug, so a rename made
    // outside the platform breaks every future grant against a name that no
    // longer resolves -- and there is no "right" name to rename it back to
    // without knowing what the rename was for. Nothing here can repair
    // that, only report it; the nightly reconcile's own `teamMembers`
    // 404-on-old-slug path is what surfaces it again if this alert goes
    // unanswered.
    await postAlert("A team's GitHub team was renamed outside the platform", [
      `platform team: ${platformSlug}`,
      `renamed from: ${payload.changes.name.from}`,
      `now named: ${payload.team.name} (${payload.team.slug})`,
    ]);
  }
}

/**
 * `create` / `delete`: a `team/<slug>` branch appeared or vanished.
 *
 * `create` only confirms freshness -- the branch existing is the expected
 * state, so there is nothing to repair. `delete` cannot be repaired from
 * inside a webhook handler by design (see the module doc comment: no
 * network calls here), so it is reported and left for the nightly reconcile,
 * which recreates a missing branch/ruleset for an active team the same way
 * `provisionTeam` always has.
 */
export async function handleRefEvent(
  database: typeof db,
  kind: "create" | "delete",
  payload: RefEventPayload,
): Promise<void> {
  if (payload.ref_type !== "branch") return;

  const platformSlug = teamSlugFromBranch(payload.ref);
  if (platformSlug === null) return;

  const team = await teamRowFor(database, platformSlug);
  if (!team) return;

  if (kind === "delete") {
    await postAlert("A team's branch was deleted outside the platform", [
      `team: ${platformSlug}`,
      `branch: ${payload.ref}`,
    ]);
  }

  await markSynced(database, team.id);
}
