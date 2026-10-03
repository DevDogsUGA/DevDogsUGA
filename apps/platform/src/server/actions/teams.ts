"use server";

import { and, count, eq, isNull, ne, sql } from "drizzle-orm";
import { env } from "~/env";
import { postAlert } from "~/server/alerts";
import { expectSession } from "~/server/auth";
import { db } from "~/server/db";
import {
  profiles,
  teamMembers,
  teamMembershipRequests,
  teams,
} from "~/server/db/schema";
import { sendEach, sendTemplate } from "~/server/email/send";
import { searchPublicProfiles } from "~/server/loaders/publicProfiles";
import {
  TeamActionError,
  isUniqueViolation,
  type TeamActionOutcome,
} from "~/server/teams/errors";
import {
  addMember,
  disbandTeam,
  provisionTeam,
  removeMember,
  userIdForGithubLogin,
} from "~/server/github/teamSync";
import {
  insertMembership,
  lockTeam,
  lockUser,
  requireCanJoin,
  type Tx,
} from "~/server/teams/requireCanJoin";
import { requireTwoFactor } from "~/server/teams/requireTwoFactor";
import { underConcurrentTeamCap } from "~/server/teams/limits";
import { consumeRateLimit } from "~/server/rateLimit";
import { usersInAuth } from "~/supabase/drizzle/schema";

/**
 * Team membership actions.
 *
 * Writes are server actions over Drizzle rather than `security definer` RPCs.
 * Teams are consumed by the platform and nothing else, so routing them through
 * RPCs would buy an independence no caller wants and pay for it by splitting
 * logic that belongs together: a join is a database write and a GitHub API
 * call, and only the first can live in Postgres.
 *
 * **GitHub-first, mirror second, in the SAME transaction.** GitHub is the
 * source of truth for who can push where; `teams`/`teamMembers` is a mirror of
 * it. Every action below calls the GitHub side effect from INSIDE the
 * transaction that also holds the advisory lock, and only writes the mirror
 * row once that call has succeeded. If GitHub fails, the function throws, the
 * transaction rolls back, and the mirror never promised an access grant that
 * was never made. This trades an ordinary anti-pattern -- holding a database
 * transaction open across a network call -- for a stronger guarantee: the
 * mirror can lag behind GitHub (the nightly reconcile repairs that), but it
 * can never claim something GitHub refused.
 *
 * Drizzle connects as the owning role, so RLS does not apply to anything here.
 * The authorization checks at the top of each action are the whole boundary.
 */

/**
 * Rate-limit budgets for the actions below, via `~/server/rateLimit.ts`.
 *
 * Every budget here is per-CALLER, on a 10-minute window, EXCEPT invites,
 * which get two separate budgets: 20/hour per inviting lead, and 50/day per
 * team. Reasoning:
 *
 * - `create`/`join`/`request`/`respond`/`leave`/`disband`: each of these is,
 *   at most, one legitimate action per person per sitting -- a member does
 *   not create ten teams or leave and rejoin ten times in ten minutes on
 *   purpose. 10/10min is generous headroom for retrying a taken slug or a
 *   mistyped join code while still bounding how many `provisionTeam`,
 *   `addMember`, `removeMember` or `disbandTeam` calls (all GitHub API
 *   calls, all against the org's rate limits too) one account can trigger
 *   in a burst.
 * - `invite`: structurally different, because a lead inviting a whole
 *   roster is a NORMAL burst that the 10/10min shape would falsely flag.
 *   The per-lead budget (20/hour) instead bounds how fast one account can
 *   fan out `teamInvite` emails -- the actual abuse surface, spam, not
 *   GitHub call volume, since an invite's `addMember` only happens later,
 *   on acceptance. The per-team budget (50/day) exists independently
 *   because a compromised OR careless lead account is not the only way a
 *   team's invite volume can run away -- transferring the lead role mid-day
 *   should not reset how many invites the TEAM has sent, so this counts
 *   against the team's id, not the (rotating) lead's.
 * - `invite search`: typeahead, so a lead typing one name fires a request per
 *   pause, not per sitting. The client debounces and waits for two
 *   characters; 60 per minute per caller leaves several people's worth of
 *   typing and retyping while still capping how fast one account can walk the
 *   public directory a prefix at a time (which `/community` already shows
 *   anyone, so the budget bounds load, not secrecy).
 */
const PER_ACCOUNT_ACTION_LIMIT = 10;
const PER_ACCOUNT_ACTION_WINDOW_SECONDS = 10 * 60;
const INVITES_PER_LEAD_LIMIT = 20;
const INVITES_PER_LEAD_WINDOW_SECONDS = 60 * 60;
const INVITES_PER_TEAM_LIMIT = 50;
const INVITES_PER_TEAM_WINDOW_SECONDS = 24 * 60 * 60;
const INVITE_SEARCH_LIMIT = 60;
const INVITE_SEARCH_WINDOW_SECONDS = 60;
const INVITE_SEARCH_MIN_QUERY = 2;
const INVITE_SEARCH_RESULTS = 8;

/**
 * Consumes one hit of a budget, translating a refusal into the error every
 * caller below already knows how to surface. Called BEFORE the GitHub call
 * or email send each action guards, per `consumeRateLimit`'s own contract:
 * a throttled attempt should cost nothing beyond the one row it writes.
 */
async function guardRateLimit(
  scope: string,
  subjectId: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  const allowed = await consumeRateLimit({
    scope,
    subjectId,
    limit,
    windowSeconds,
  });
  if (!allowed) throw new TeamActionError("rate_limited");
}

const JOIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Ambiguous glyphs (0/O, 1/I/L) are omitted: this gets read aloud in a room. */
function generateJoinCode(length = 6): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(
    bytes,
    (b) => JOIN_CODE_ALPHABET[b % JOIN_CODE_ALPHABET.length],
  ).join("");
}

/**
 * A code no other team holds, since `joinTeamImpl` finds the team by its code
 * alone. At six characters from 32 a retry is all but never taken; the loop
 * is there so it is correct rather than merely likely.
 */
async function unusedJoinCode(tx: Tx): Promise<string> {
  for (;;) {
    const code = generateJoinCode();
    const [taken] = await tx
      .select({ id: teams.id })
      .from(teams)
      .where(eq(teams.joinCode, code))
      .limit(1);
    if (!taken) return code;
  }
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "team"
  );
}

/** Translates a GitHub failure into the code a caller can act on. */
function githubProblem(result: {
  skipped?: string;
  detail?: string;
}): TeamActionError {
  return result.skipped === "not_linked"
    ? new TeamActionError("github_not_linked")
    : new TeamActionError(
        "github_unavailable",
        result.detail ?? result.skipped,
      );
}

async function requireLead(tx: Tx, teamId: string, userId: string) {
  const [row] = await tx
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.teamId, teamId),
        eq(teamMembers.userId, userId),
        isNull(teamMembers.leftAt),
      ),
    )
    .limit(1);

  if (!row) throw new TeamActionError("not_a_member");
  if (row.role !== "lead") throw new TeamActionError("not_the_lead");
}

/** Whether this member is currently active on this team. */
async function isActiveMember(
  tx: Tx,
  teamId: string,
  userId: string,
): Promise<boolean> {
  const [row] = await tx
    .select({ teamId: teamMembers.teamId })
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.teamId, teamId),
        eq(teamMembers.userId, userId),
        isNull(teamMembers.leftAt),
      ),
    )
    .limit(1);
  return row !== undefined;
}

/**
 * The created team, identified the way the routes are.
 *
 * Both the id and the slug: the id is what the mirror is keyed on, and the
 * slug is what `/teams/[team]` and the GitHub branch are keyed on. Returning
 * only the id leaves a form with nowhere to navigate after a successful
 * create.
 */
export interface CreatedTeam {
  id: string;
  slug: string;
}

async function createTeamImpl(name: string): Promise<CreatedTeam> {
  const userId = await expectSession();
  // Checked before `requireTwoFactor` -- itself a GitHub call -- and
  // everything below it. See the budgets' doc comment above.
  await guardRateLimit(
    "team:create",
    userId,
    PER_ACCOUNT_ACTION_LIMIT,
    PER_ACCOUNT_ACTION_WINDOW_SECONDS,
  );
  // The creator becomes the lead the moment this returns, which is push
  // access to the org repo -- see `requireTwoFactor`'s doc on why this is
  // checked before anything else, not deferred to the GitHub grant below.
  await requireTwoFactor(userId);
  const slug = slugify(name);

  return db.transaction(async (tx) => {
    // Only the creator's cap matters here -- there is no existing team row to
    // lock, and the slug's own unique constraint is what catches a name race.
    await lockUser(tx, userId);

    const [activeTeams] = await tx
      .select({ n: count() })
      .from(teamMembers)
      .where(and(eq(teamMembers.userId, userId), isNull(teamMembers.leftAt)));
    if (!underConcurrentTeamCap(activeTeams?.n ?? 0)) {
      throw new TeamActionError("too_many_teams");
    }

    // GitHub first: the team, its branch and its ruleset have to exist, and
    // the creator has to be able to push, before anything is promised in the
    // mirror. A slug collision is caught below by the mirror's own unique
    // constraint, cheaply, before any of this runs -- see the early check.
    const provisioned = await provisionTeam(slug);
    if (!provisioned.ok) throw githubProblem(provisioned);
    const granted = await addMember(slug, userId);
    if (!granted.ok) throw githubProblem(granted);

    let team: CreatedTeam | undefined;
    try {
      [team] = await tx
        .insert(teams)
        .values({
          slug,
          name,
          joinCode: await unusedJoinCode(tx),
          createdBy: userId,
          // Just confirmed, above: the team, its branch, its ruleset and the
          // creator's grant all exist on GitHub as of this instant, so the
          // mirror starts fresh rather than null.
          githubSyncedAt: new Date(),
        })
        .returning({ id: teams.id, slug: teams.slug });
    } catch (error) {
      // Two teams landing on the same slugified name, or any other reason
      // this insert fails. Either way the GitHub team and its ruleset above
      // are now orphaned -- there is no mirror row to reconcile them against
      // -- so this tears them back down itself rather than leaving them for
      // an officer to notice. Best-effort: a member already has a real error
      // to see below, and a stuck GitHub team is a smaller problem than
      // losing that error to one from cleanup, so a teardown failure is
      // reported, not thrown.
      const teardown = await disbandTeam(slug);
      if (!teardown.ok) {
        await postAlert("Orphaned GitHub team after a failed team create", [
          `slug: ${slug}`,
          teardown.detail ?? teardown.skipped ?? "unknown reason",
        ]);
      }

      // Translated here because the untranslated 23505 reaches the member as
      // "something went wrong on our side", which sends them to ask an
      // officer about a problem they could have solved by picking another
      // name.
      if (isUniqueViolation(error, "teams_slug_key")) {
        throw new TeamActionError("name_taken");
      }
      throw error;
    }

    if (!team) throw new TeamActionError("not_found");

    // The creator is the lead. Inserted directly rather than through
    // `requireCanJoin`: the team is brand new, so every check it would run
    // (linked identity, not already a member, room on the team) is trivially
    // true, and the cap was already checked above under this same lock.
    await tx.insert(teamMembers).values({
      teamId: team.id,
      userId,
      role: "lead",
    });

    return team;
  });
}

/**
 * Joins whichever team the code belongs to. The code alone names the team, so
 * a member holding one never has to also say which team it is for.
 *
 * Returns the team's slug, so the form can land the new member on it.
 */
async function joinTeamImpl(joinCode: string): Promise<string> {
  const userId = await expectSession();
  await guardRateLimit(
    "team:join",
    userId,
    PER_ACCOUNT_ACTION_LIMIT,
    PER_ACCOUNT_ACTION_WINDOW_SECONDS,
  );
  await requireTwoFactor(userId);

  return db.transaction(async (tx) => {
    // Nothing in the schema makes codes unique, only `createTeamImpl`'s
    // retry, so two matches is possible for rows that predate it. A code
    // that names two teams names neither.
    const matches = await tx
      .select({ id: teams.id })
      .from(teams)
      .where(eq(teams.joinCode, joinCode.trim().toUpperCase()))
      .limit(2);
    const [team] = matches;
    if (!team || matches.length > 1) {
      throw new TeamActionError("bad_join_code");
    }

    const { slug } = await requireCanJoin(tx, { teamId: team.id, userId });

    const granted = await addMember(slug, userId);
    if (!granted.ok) throw githubProblem(granted);

    await insertMembership(tx, { teamId: team.id, userId });
    await touchGithubSynced(tx, team.id);
    return slug;
  });
}

async function requestToJoinImpl(
  teamId: string,
  rawMessage?: string,
): Promise<string> {
  // An all-whitespace note is no note. Normalized here rather than in a form,
  // because it is a fact about the value rather than about one screen.
  //
  // `||` is load-bearing and must NOT become `??`. Trimming produces `""` for
  // an all-whitespace note, and `""` is not nullish. `??` would keep it and
  // store an empty string as if it were a real message, which is the exact
  // thing this line exists to prevent.
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const message = rawMessage?.trim() || undefined;
  const userId = await expectSession();
  // `requestToJoinImpl` itself never calls GitHub -- the grant happens on
  // acceptance, in `respondToMembershipImpl` -- but `requireTwoFactor` right
  // below does, and a flood of requests is its own abuse surface (every one
  // is a review a lead has to work through). Same per-account budget as
  // create/join.
  await guardRateLimit(
    "team:request",
    userId,
    PER_ACCOUNT_ACTION_LIMIT,
    PER_ACCOUNT_ACTION_WINDOW_SECONDS,
  );
  await requireTwoFactor(userId);

  const requestId = await db.transaction(async (tx) => {
    const [team] = await tx
      .select({ id: teams.id })
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);
    if (!team) throw new TeamActionError("not_found");

    if (await isActiveMember(tx, teamId, userId)) {
      throw new TeamActionError("already_on_team");
    }

    // Deliberately NOT checked here: the concurrent-team cap and whether the
    // team is full. Both are validated when the request is ANSWERED, never
    // when it is created -- asking a few teams and joining whichever answers
    // first is the intended use, and a request that turns out to be
    // unanswerable is a normal outcome the requests page explains, not a
    // creation-time refusal.
    return insertRequest(tx, {
      teamId,
      userId,
      direction: "request",
      createdBy: userId,
      message,
    });
  });

  // Best-effort, same as `notifyInvitee` below: the request is real the
  // moment the row above committed, and `/teams/requests` shows it there to
  // the lead regardless. The email is a notification of that fact, not a
  // second source of truth, so a failure here is logged and swallowed
  // rather than unwinding a request that already exists.
  await notifyLeadsOfRequest(teamId, userId).catch((error: unknown) => {
    console.error("[teams] failed to send joinRequest email:", error);
  });

  return requestId;
}

/**
 * Sends the `joinRequest` email to every current lead of the team. Reads
 * outside any transaction -- by the time this runs the request already
 * committed, so there is nothing left to hold a lock over.
 *
 * `teamMembers_one_lead_per_team` allows at most one active lead per team
 * today, but this queries by role rather than assuming that stays true, the
 * same way `notifyInvitee` does not hardcode a single recipient shape.
 */
async function notifyLeadsOfRequest(
  teamId: string,
  applicantId: string,
): Promise<void> {
  const [leads, team, applicant] = await Promise.all([
    db
      .select({
        email: usersInAuth.email,
        preferredName: profiles.preferredName,
      })
      .from(teamMembers)
      .innerJoin(usersInAuth, eq(usersInAuth.id, teamMembers.userId))
      .leftJoin(profiles, eq(profiles.userId, teamMembers.userId))
      .where(
        and(
          eq(teamMembers.teamId, teamId),
          eq(teamMembers.role, "lead"),
          isNull(teamMembers.leftAt),
        ),
      ),
    db
      .select({ name: teams.name })
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select({ preferredName: profiles.preferredName })
      .from(profiles)
      .where(eq(profiles.userId, applicantId))
      .limit(1)
      .then((rows) => rows[0]),
  ]);

  if (!team) return;

  const reviewUrl = new URL("/teams/requests", env.BASE_URL).toString();

  // `sendEach`, not `sendTemplate` per lead in a `Promise.all`: more than one
  // active lead is not possible today (`teamMembers_one_lead_per_team`), but
  // when it is, this is the fan-out primitive `send.ts` already exists for --
  // one call per recipient, never one call with several.
  await sendEach(
    leads
      .filter((lead): lead is typeof lead & { email: string } =>
        Boolean(lead.email),
      )
      .map((lead) => ({
        to: lead.email,
        props: {
          leadName: lead.preferredName ?? "there",
          applicantName: applicant?.preferredName ?? "Someone",
          teamName: team.name,
          reviewUrl,
        },
      })),
    "JoinRequest",
  );
}

/**
 * The account an invite identifier names, or null. Three shapes, in this
 * order:
 *
 * 1. `@handle` -- a leading `@` and no other `@`. A member's public profile
 *    handle, which the invite picker fills in when a suggestion is chosen
 *    (see `searchInvitees`). Resolved through `searchPublicProfiles`, so it
 *    only ever finds what the Community directory shows: a hidden, unverified,
 *    quarantined or suspended member returns null, indistinguishable from a
 *    handle that does not exist. This check must come BEFORE the email check,
 *    which fires on any `@`. It cannot swallow a real email: an address needs
 *    something before its `@`, so it never starts with one, and one with a
 *    second `@` is not a handle either.
 * 2. An email, anything else containing `@`. Exact match on the account's
 *    sign-in address, which works for every member whether or not they have a
 *    public profile.
 * 3. A GitHub username, exact match on the linked identity. UGA emails and
 *    GitHub logins never collide on `@`.
 *
 * Email and GitHub username are the only routes to a member who is not
 * public: there is no way to search for them, a lead has to already know the
 * exact value. `usersInAuth.email` is the account's sign-in address; a GitHub
 * username only ever appears on the linked identity's `identity_data`
 * (`githubLoginFor`'s counterpart, `userIdForGithubLogin`, in
 * `teamSync.ts`), because this platform does not duplicate it anywhere of its
 * own.
 *
 * Not exported: this file is `"use server"`, so every export is callable from
 * a browser, and this returns account ids.
 */
async function resolveInvitee(identifier: string): Promise<string | null> {
  const trimmed = identifier.trim();
  if (trimmed.length === 0) return null;

  if (trimmed.startsWith("@") && !trimmed.slice(1).includes("@")) {
    const handle = trimmed.slice(1).toLowerCase();
    if (handle.length === 0) return null;
    // `searchPublicProfiles` is a prefix search that ranks an exact handle
    // first, so the top hit is either that handle or proof there is none.
    const [match] = await searchPublicProfiles(handle, 1);
    return match?.handle === handle ? match.userId : null;
  }

  if (trimmed.includes("@")) {
    // Case-insensitive on BOTH sides: `usersInAuth.email` is whatever case
    // the identity provider handed Supabase, not normalized at signup, so
    // comparing it as-is against a lowercased `trimmed` only matched an
    // invitee whose stored email happened to already be lowercase. Still
    // index-friendly: `auth.users` already carries
    // `users_instance_id_email_idx`, a btree on
    // `(instance_id, lower(email))` (Supabase's own index, in
    // `supabase/drizzle/schema.ts`). This query filters only on the second
    // column, but with one `instance_id` in a self-hosted project that
    // column is near-constant, so Postgres still walks the index rather than
    // falling back to a sequential scan over `auth.users`.
    const [row] = await db
      .select({ id: usersInAuth.id })
      .from(usersInAuth)
      .where(sql`lower(${usersInAuth.email}) = lower(${trimmed})`)
      .limit(1);
    return row?.id ?? null;
  }

  return userIdForGithubLogin(trimmed);
}

/**
 * One invite-picker suggestion. Deliberately no `userId`: picking one puts
 * `@handle` in the identifier field and the invite resolves it again
 * server-side, so an account id never reaches the browser.
 */
export interface InviteeSuggestion {
  handle: string;
  /** The member's name, or `@handle` when they hide it. */
  label: string;
  /** Null when the member hides their avatar or never uploaded one. */
  avatarUrl: string | null;
}

async function searchInviteesImpl(
  teamId: string,
  query: string,
): Promise<InviteeSuggestion[]> {
  const callerId = await expectSession();

  // Too short to be worth a database read or a budget hit; the client does
  // not send these either.
  if (query.trim().replace(/^@/, "").length < INVITE_SEARCH_MIN_QUERY) {
    return [];
  }

  // Before the lead check so probing teams one is not a lead of is bounded
  // too.
  await guardRateLimit(
    "team:invite:search",
    callerId,
    INVITE_SEARCH_LIMIT,
    INVITE_SEARCH_WINDOW_SECONDS,
  );
  await db.transaction((tx) => requireLead(tx, teamId, callerId));

  const matches = await searchPublicProfiles(query, INVITE_SEARCH_RESULTS);
  return matches.map((match) => ({
    handle: match.handle,
    label: match.displayName ?? `@${match.handle}`,
    avatarUrl: match.avatarUrl,
  }));
}

async function inviteToTeamImpl(
  teamId: string,
  identifier: string,
): Promise<string> {
  const callerId = await expectSession();

  // Both budgets checked before `resolveInvitee` (a database read) and the
  // transaction below -- see the budgets' doc comment for why invites get
  // two separate counters rather than the one every other action uses.
  await guardRateLimit(
    "team:invite:user",
    callerId,
    INVITES_PER_LEAD_LIMIT,
    INVITES_PER_LEAD_WINDOW_SECONDS,
  );
  await guardRateLimit(
    "team:invite:team",
    teamId,
    INVITES_PER_TEAM_LIMIT,
    INVITES_PER_TEAM_WINDOW_SECONDS,
  );

  // Resolved before the transaction: a database read with no lock to hold,
  // and the "no match" refusal below should not wait on `requireLead`
  // failing first -- a lead who mistypes the identifier learns that
  // regardless of whether they lead this team.
  const inviteeId = await resolveInvitee(identifier);
  if (inviteeId === null) {
    throw new TeamActionError(
      "invitee_not_found",
      "Nobody on the platform matches that email, GitHub username or @handle exactly. Have them sign up and link GitHub, then invite them again.",
    );
  }

  const requestId = await db.transaction(async (tx) => {
    await requireLead(tx, teamId, callerId);

    if (await isActiveMember(tx, teamId, inviteeId)) {
      throw new TeamActionError("already_on_team");
    }

    return insertRequest(tx, {
      teamId,
      userId: inviteeId,
      direction: "invite",
      createdBy: callerId,
    });
  });

  // Best-effort: the invitation is real the moment the row above committed,
  // and `/teams/requests` shows it there regardless. The email is a
  // notification of that fact, not a second source of truth, so a failure
  // here (no EMAIL binding locally, a bounce, GitHub's app down) is logged
  // and swallowed rather than unwinding an invite that already exists.
  await notifyInvitee(teamId, inviteeId, callerId).catch((error: unknown) => {
    console.error("[teams] failed to send teamInvite email:", error);
  });

  return requestId;
}

/**
 * Sends the `teamInvite` email. Reads outside any transaction -- by the time
 * this runs the invite already committed, so there is nothing left to hold a
 * lock over.
 *
 * Silently does nothing for an invitee with no discoverable email: this can
 * only happen for a GitHub-only login whose Supabase account genuinely has
 * none on file, which `resolveInvitee`'s email branch never would have
 * matched anyway. `/teams/requests` is still where the invitation lives
 * either way -- see this file's header on email being the notification, not
 * the record.
 */
async function notifyInvitee(
  teamId: string,
  inviteeId: string,
  leadId: string,
): Promise<void> {
  const [invitee, lead, team] = await Promise.all([
    db
      .select({
        email: usersInAuth.email,
        preferredName: profiles.preferredName,
      })
      .from(usersInAuth)
      .leftJoin(profiles, eq(profiles.userId, usersInAuth.id))
      .where(eq(usersInAuth.id, inviteeId))
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select({ preferredName: profiles.preferredName })
      .from(profiles)
      .where(eq(profiles.userId, leadId))
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select({ name: teams.name })
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1)
      .then((rows) => rows[0]),
  ]);

  if (!invitee?.email || !team) return;

  await sendTemplate(invitee.email, "TeamInvite", {
    inviteeName: invitee.preferredName ?? "there",
    teamName: team.name,
    leadName: lead?.preferredName ?? "A team lead",
    acceptUrl: new URL("/teams/requests", env.BASE_URL).toString(),
  });
}

async function insertRequest(
  tx: Tx,
  values: {
    teamId: string;
    userId: string;
    direction: "invite" | "request";
    createdBy: string;
    message?: string;
  },
): Promise<string> {
  try {
    const [row] = await tx
      .insert(teamMembershipRequests)
      .values(values)
      .returning({ id: teamMembershipRequests.id });
    if (!row) throw new TeamActionError("not_found");
    return row.id;
  } catch (error) {
    // The partial unique index allows one PENDING approach per (team, member)
    // in either direction, so a duplicate is "there is already one open", not
    // a hard failure.
    if (
      isUniqueViolation(
        error,
        "teamMembershipRequests_one_pending_per_team_user",
      )
    ) {
      throw new TeamActionError(
        "request_not_actionable",
        "There is already a pending invitation or request for that member",
      );
    }
    throw error;
  }
}

async function respondToMembershipImpl(
  requestId: string,
  accept: boolean,
): Promise<void> {
  const callerId = await expectSession();

  // Only `accept` reaches `requireTwoFactor`/`addMember` below -- decline is
  // a pure status update with no GitHub call, so it is not worth spending a
  // hit of the caller's budget on. Guarded here, before the transaction,
  // since `accept` is already known from the argument and nothing inside
  // the transaction changes that answer.
  if (accept) {
    await guardRateLimit(
      "team:respond",
      callerId,
      PER_ACCOUNT_ACTION_LIMIT,
      PER_ACCOUNT_ACTION_WINDOW_SECONDS,
    );
  }

  await db.transaction(async (tx) => {
    const [request] = await tx
      .select({
        id: teamMembershipRequests.id,
        teamId: teamMembershipRequests.teamId,
        userId: teamMembershipRequests.userId,
        direction: teamMembershipRequests.direction,
        status: teamMembershipRequests.status,
      })
      .from(teamMembershipRequests)
      .where(eq(teamMembershipRequests.id, requestId))
      .limit(1);

    if (!request) throw new TeamActionError("not_found");
    if (request.status !== "pending") {
      throw new TeamActionError("request_not_actionable");
    }

    // Who may answer follows from the direction: an invitation is answered by
    // its recipient, a request by the team's lead. This is the only place the
    // two halves of the shared table behave differently.
    if (request.direction === "invite") {
      if (request.userId !== callerId) {
        throw new TeamActionError("request_not_actionable");
      }
    } else {
      await requireLead(tx, request.teamId, callerId);
    }

    // Declining needs none of the checks below: it is always allowed, and it
    // must not fail because the cap or the roster changed underneath it.
    if (!accept) {
      await tx
        .update(teamMembershipRequests)
        .set({
          status: "declined",
          respondedAt: new Date(),
          respondedBy: callerId,
        })
        .where(eq(teamMembershipRequests.id, requestId));
      return;
    }

    // The person GAINING access here is `request.userId`, not the caller --
    // for an invite direction those are the same account (checked above),
    // but for a join request the caller is the lead approving somebody
    // else's push access, and it is that somebody else's 2FA that matters.
    await requireTwoFactor(request.userId);

    // Re-validated here rather than trusted from creation time: the cap, the
    // roster and the GitHub link can all have changed since this request was
    // opened. `requireCanJoin` takes the lock this whole acceptance runs
    // under.
    const { slug } = await requireCanJoin(tx, {
      teamId: request.teamId,
      userId: request.userId,
    });

    const granted = await addMember(slug, request.userId);
    if (!granted.ok) throw githubProblem(granted);

    await insertMembership(tx, {
      teamId: request.teamId,
      userId: request.userId,
    });
    await touchGithubSynced(tx, request.teamId);

    await tx
      .update(teamMembershipRequests)
      .set({
        status: "accepted",
        respondedAt: new Date(),
        respondedBy: callerId,
      })
      .where(eq(teamMembershipRequests.id, requestId));

    // Unlike the old one-team-per-competition model, accepting this one does
    // NOT withdraw the member's other pending approaches: a contributor may
    // be active on up to `MAX_CONCURRENT_TEAMS_PER_USER` teams at once, so a
    // second acceptance is not automatically moot. If it would push them over
    // the cap, `requireCanJoin` refuses it on its own turn with
    // `too_many_teams`, and the request stays pending for them to decline.
  });
}

async function leaveTeamImpl(teamId: string): Promise<void> {
  const userId = await expectSession();
  // `removeMember` below is a GitHub call, same budget as the other
  // single-actor actions.
  await guardRateLimit(
    "team:leave",
    userId,
    PER_ACCOUNT_ACTION_LIMIT,
    PER_ACCOUNT_ACTION_WINDOW_SECONDS,
  );

  await db.transaction(async (tx) => {
    await lockTeam(tx, teamId);

    const [membership] = await tx
      .select({ role: teamMembers.role })
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.teamId, teamId),
          eq(teamMembers.userId, userId),
          isNull(teamMembers.leftAt),
        ),
      )
      .limit(1);

    if (!membership) throw new TeamActionError("not_a_member");

    if (membership.role === "lead") {
      const [other] = await tx
        .select({ userId: teamMembers.userId })
        .from(teamMembers)
        .where(
          and(
            eq(teamMembers.teamId, teamId),
            ne(teamMembers.userId, userId),
            isNull(teamMembers.leftAt),
          ),
        )
        .limit(1);

      // A team with no lead has nobody who can invite, respond or transfer,
      // and the partial unique index means one cannot simply be promoted by a
      // second writer. Leaving last is fine; the row goes with the member.
      if (other) throw new TeamActionError("lead_must_transfer_first");
    }

    // GitHub first, same as every grant: if the revoke fails, the mirror
    // stays exactly as it was, which is the correct state to be in when the
    // member in fact still has push access.
    const revoked = await removeMember(await teamSlugOf(tx, teamId), userId);
    if (!revoked.ok) throw githubProblem(revoked);

    // A stint ends, it is not erased: `leftAt` is set rather than the row
    // deleted, so a later competition step can still ask who was on this
    // team at some past moment.
    await tx
      .update(teamMembers)
      .set({ leftAt: new Date() })
      .where(
        and(
          eq(teamMembers.teamId, teamId),
          eq(teamMembers.userId, userId),
          isNull(teamMembers.leftAt),
        ),
      );
    await touchGithubSynced(tx, teamId);
  });
}

/**
 * Marks a team's mirror as freshly confirmed against GitHub.
 *
 * Called from inside the same transaction as the GitHub call it follows, not
 * as a separate pass over `teams` -- the transaction is already open and
 * already knows the GitHub grant just succeeded, so recording that is one
 * more statement under the same commit rather than a second round-trip
 * dependent on this one having landed.
 */
async function touchGithubSynced(tx: Tx, teamId: string): Promise<void> {
  await tx
    .update(teams)
    .set({ githubSyncedAt: new Date() })
    .where(eq(teams.id, teamId));
}

async function teamSlugOf(tx: Tx, teamId: string): Promise<string> {
  const [row] = await tx
    .select({ slug: teams.slug })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!row) throw new TeamActionError("not_found");
  return row.slug;
}

async function transferLeadImpl(
  teamId: string,
  newLeadId: string,
): Promise<void> {
  const callerId = await expectSession();

  await db.transaction(async (tx) => {
    // Same lock as leave/disband. Without it, a transfer racing a concurrent
    // leaveTeam on the promoted member can interleave: both read an active
    // membership, both report success, and the team ends up with the old
    // lead demoted and the new one promoted-but-left -- no active lead, and
    // no self-service action left that can create one.
    await lockTeam(tx, teamId);

    await requireLead(tx, teamId, callerId);

    if (!(await isActiveMember(tx, teamId, newLeadId))) {
      throw new TeamActionError("not_a_member");
    }

    // Demote first. The partial unique index permits exactly one ACTIVE lead
    // per team, so promoting before demoting violates it. Within one
    // transaction the order is the whole difference between working and
    // 23505.
    await tx
      .update(teamMembers)
      .set({ role: "member" })
      .where(
        and(
          eq(teamMembers.teamId, teamId),
          eq(teamMembers.userId, callerId),
          isNull(teamMembers.leftAt),
        ),
      );

    // Defense in depth: the lock plus the isActiveMember check above should
    // make this affect exactly one row, but if some other path this file
    // does not yet know about ever races it, failing loudly here is better
    // than silently leaving the team with no active lead.
    const promoted = await tx
      .update(teamMembers)
      .set({ role: "lead" })
      .where(
        and(
          eq(teamMembers.teamId, teamId),
          eq(teamMembers.userId, newLeadId),
          isNull(teamMembers.leftAt),
        ),
      )
      .returning({ id: teamMembers.id });

    if (promoted.length === 0) throw new TeamActionError("not_a_member");
  });
}

async function disbandTeamImpl(teamId: string): Promise<void> {
  const userId = await expectSession();
  // `disbandTeam` below is a GitHub call, same budget as the other
  // single-actor actions.
  await guardRateLimit(
    "team:disband",
    userId,
    PER_ACCOUNT_ACTION_LIMIT,
    PER_ACCOUNT_ACTION_WINDOW_SECONDS,
  );

  await db.transaction(async (tx) => {
    await lockTeam(tx, teamId);
    await requireLead(tx, teamId, userId);

    const slug = await teamSlugOf(tx, teamId);

    // GitHub first: the ruleset and the GitHub team come down before the
    // mirror row does, so a failure here leaves the mirror -- and therefore
    // every member's access -- exactly as it was.
    const torn = await disbandTeam(slug);
    if (!torn.ok) throw githubProblem(torn);

    // `teamMembers` and any pending `teamMembershipRequests` cascade off this
    // delete, so a disbanded team's history does not outlive the team itself.
    // (The branch and its pull-request history do -- see `disbandTeam`.)
    await tx.delete(teams).where(eq(teams.id, teamId));
  });
}

// ── The boundary ─────────────────────────────────────────────────────────────

/**
 * Every action returns an outcome; none of them throws across the wire.
 *
 * The implementations above throw `TeamActionError`, which is the right shape
 * for them. The checks read as a chain of guards rather than as a result
 * threaded through by hand. But a thrown error does not survive the trip to a
 * client component: Next redacts an uncaught server-action error in
 * production and hands the browser an opaque digest, so `error.code`, the thing
 * every one of these screens branches on, reads correctly in development and is
 * GONE in the deployed build.
 *
 * Converting here rather than in a per-page wrapper is what makes that
 * impossible to forget. A page that forgets is not broken in a way anybody
 * notices locally; it is broken only once it ships.
 */
async function attempt<T>(
  run: () => Promise<T>,
): Promise<TeamActionOutcome<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    if (error instanceof TeamActionError) {
      return { ok: false, code: error.code };
    }
    // Anything else is a fault rather than a refusal: a dropped connection, a
    // constraint nothing translated. Logged so the server keeps it, and
    // reported as "unknown" so a member is not told they did something wrong.
    console.error("[teams] unexpected action failure:", error);
    return { ok: false, code: "unknown" };
  }
}

export async function createTeam(
  name: string,
): Promise<TeamActionOutcome<CreatedTeam>> {
  return attempt(() => createTeamImpl(name));
}

export async function joinTeam(
  joinCode: string,
): Promise<TeamActionOutcome<string>> {
  return attempt(() => joinTeamImpl(joinCode));
}

export async function requestToJoin(
  teamId: string,
  message?: string,
): Promise<TeamActionOutcome<string>> {
  return attempt(() => requestToJoinImpl(teamId, message));
}

/**
 * `identifier` is an exact email, GitHub username or `@handle`, never an
 * account id. See `resolveInvitee`.
 */
export async function inviteToTeam(
  teamId: string,
  identifier: string,
): Promise<TeamActionOutcome<string>> {
  return attempt(() => inviteToTeamImpl(teamId, identifier));
}

/**
 * Typeahead for the invite picker: public members whose handle or name starts
 * with `query` (at least two characters), at most eight, lead-only and rate
 * limited. Covers the same members as the Community directory and nobody
 * else; everyone else is invited by exact email or GitHub username.
 */
export async function searchInvitees(
  teamId: string,
  query: string,
): Promise<TeamActionOutcome<InviteeSuggestion[]>> {
  return attempt(() => searchInviteesImpl(teamId, query));
}

export async function respondToMembership(
  requestId: string,
  accept: boolean,
): Promise<TeamActionOutcome<void>> {
  return attempt(() => respondToMembershipImpl(requestId, accept));
}

export async function leaveTeam(
  teamId: string,
): Promise<TeamActionOutcome<void>> {
  return attempt(() => leaveTeamImpl(teamId));
}

export async function transferLead(
  teamId: string,
  newLeadId: string,
): Promise<TeamActionOutcome<void>> {
  return attempt(() => transferLeadImpl(teamId, newLeadId));
}

export async function disbandTeamAction(
  teamId: string,
): Promise<TeamActionOutcome<void>> {
  return attempt(() => disbandTeamImpl(teamId));
}
