import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import BranchCommands from "~/components/teams/BranchCommands";
import InviteForm from "~/components/teams/InviteForm";
import JoinTeamForm from "~/components/teams/JoinTeamForm";
import RosterActions from "~/components/teams/RosterActions";
import PageShell from "~/components/PageShell";
import { formatEventDateTime, formatRelative } from "~/lib/eventTime";
import {
  disbandTeamAction,
  inviteToTeam,
  searchInvitees,
  joinTeam,
  leaveTeam,
  requestToJoin,
  transferLead,
} from "~/server/actions/teams";
import { requireSession } from "~/server/auth/require";
import {
  getAllTeams,
  getPendingForUser,
  getTeamDetail,
  getTeamEntries,
} from "~/server/loaders/teams";
import { isMirrorStale } from "~/server/teams/mirrorFreshness";
import Badge from "~/ui/badge";
import Callout from "~/ui/callout";
import { ConsoleCard } from "~/ui/card";

/**
 * Noindex, because "public" below means public to members.
 *
 * The page exists so somebody can find a team they are not on, and
 * `requireSession()` is still the door. A crawler gets the `/auth` redirect,
 * and what it must never get is the join code the loader reveals to a member.
 */
export const metadata: Metadata = {
  title: "Team | DevDogs",
  robots: { index: false },
};

/**
 * /teams/[team], one team.
 *
 * A persistent project team, not a per-competition roster. There is no
 * roster lock to render: the only ceilings are the size and concurrent-team
 * caps, both enforced when a join is attempted rather than displayed as a
 * state of the page.
 */
export default async function TeamPage({
  params,
}: {
  params: Promise<{ team: string }>;
}) {
  const { team: teamSlug } = await params;
  const userId = await requireSession();

  const team = await getTeamDetail(teamSlug, userId);
  if (!team) notFound();

  const viewer = team.members.find((member) => member.userId === userId);
  const isMember = viewer !== undefined;
  const isLead = viewer?.role === "lead";

  // Only the lead sees what is waiting on THEM to answer -- a member has
  // nothing to decide here, and a stranger has no reason to know a queue
  // exists at all. `/teams/requests` is the full answer/decline surface;
  // this is a pointer to it, not a second copy of it.
  const pendingForLead = isLead
    ? (await getPendingForUser(userId)).filter(
        (request) => request.teamId === team.id,
      )
    : [];
  const entries = await getTeamEntries(team.id);
  const checkedAt = new Date();

  return (
    <PageShell
      accent="emerald"
      title={team.name}
      description={`${team.members.length} ${team.members.length === 1 ? "member" : "members"}`}
    >
      <ConsoleCard.Root id="roster">
        <ConsoleCard.Header title="Roster" />
        <ConsoleCard.Content>
          <p className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-mauve-400">
            <a
              href={team.branchUrl}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-mauve-200"
            >
              {team.branch} on GitHub
            </a>
            {isMirrorStale(team.githubSyncedAt, checkedAt) && (
              <span>
                {/* A muted note, not a warning callout -- the mirror lagging
                    behind GitHub by a few days is drift the nightly reconcile
                    is built to close on its own, not something a member needs
                    to act on. */}
                {team.githubSyncedAt === null
                  ? "never confirmed against GitHub"
                  : `last confirmed against GitHub ${formatRelative(team.githubSyncedAt)}`}
              </span>
            )}
          </p>
          <div className="mb-4">
            <BranchCommands branch={team.branch} cloneUrl={team.cloneUrl} />
          </div>
          {pendingForLead.length > 0 && (
            <Callout tone="info" title="Waiting on you" className="mb-4">
              {pendingForLead.length}{" "}
              {pendingForLead.length === 1 ? "person is" : "people are"} waiting
              on an invitation or join request for this team.{" "}
              <Link href="/teams/requests" className="underline">
                Answer them
              </Link>
              .
            </Callout>
          )}
          <ul className="flex flex-col gap-2">
            {team.members.map((member) => (
              <li
                key={member.userId}
                className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm"
              >
                <span className="font-semibold text-white">
                  {/* The preferred name is optional, so no name set is a real
                      state. A raw user id in its place would be uglier and more
                      identifying than saying nothing. */}
                  {member.preferredName ?? "Member"}
                  {member.userId === userId && (
                    <span className="ml-2 text-xs font-normal text-mauve-400">
                      you
                    </span>
                  )}
                  {member.role === "lead" && (
                    <Badge variant="info" className="ml-2 font-normal">
                      Lead
                    </Badge>
                  )}
                </span>
                <time
                  dateTime={member.joinedAt.toISOString()}
                  className="text-xs text-mauve-400"
                >
                  joined {formatEventDateTime(member.joinedAt)}
                </time>
              </li>
            ))}
          </ul>
        </ConsoleCard.Content>
      </ConsoleCard.Root>

      {/* Only rendered once this team has actually opened a PR against a
          competition -- a team between competitions has nothing here, and
          an empty card saying so would outrank the roster for attention it
          does not deserve. */}
      {entries.length > 0 && (
        <ConsoleCard.Root id="entries">
          <ConsoleCard.Header title="Competition Entries" />
          <ConsoleCard.Content>
            <ul className="flex flex-col gap-2">
              {entries.map((entry) => (
                <li
                  key={entry.prNumber}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm"
                >
                  <span className="flex items-center gap-3">
                    <Link
                      href={`/competitions/${entry.competitionSlug}/results`}
                      className="font-semibold text-white underline"
                    >
                      {entry.competitionTitle}
                    </Link>
                    <a
                      href={entry.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-mauve-400 underline underline-offset-2 hover:text-mauve-200"
                    >
                      PR #{entry.prNumber}
                    </a>
                  </span>
                  {entry.won && <Badge variant="success">Winner</Badge>}
                </li>
              ))}
            </ul>
          </ConsoleCard.Content>
        </ConsoleCard.Root>
      )}

      {/* The loader returns `joinCode: null` to everybody not on this team, and
          that null IS the access control; there is no second way to ask for it.
          Rendering the block only when it is non-null keeps that one decision,
          rather than re-deciding "is this person a member" here, where it could
          get the answer wrong. */}
      {team.joinCode !== null && (
        <ConsoleCard.Root id="join-code">
          <ConsoleCard.Header title="Join Code" />
          <ConsoleCard.Content>
            <div>
              <p>
                {/* Rendered as code rather than as a heading: it is a literal
                    string somebody retypes into a form, and it gets read aloud
                    in a room, so it stays monospaced and wide-tracked. */}
                <code className="rounded-sm bg-white/10 px-2 py-1 font-mono text-2xl font-bold tracking-widest text-mauve-200">
                  {team.joinCode}
                </code>
              </p>
              <p className="mt-3 max-w-prose text-sm text-mauve-400">
                Anybody holding this can walk onto the team, so give it out
                rather than post it. No characters that get misheard — no zero,
                no letter O.
              </p>
            </div>
          </ConsoleCard.Content>
        </ConsoleCard.Root>
      )}

      {isMember ? (
        <>
          {isLead && (
            <InviteForm
              teamId={team.id}
              inviteToTeam={inviteToTeam}
              searchInvitees={searchInvitees}
            />
          )}
          <RosterActions
            teamId={team.id}
            isLead={viewer.role === "lead"}
            otherMembers={team.members
              .filter((member) => member.userId !== userId)
              .map((member) => ({
                userId: member.userId,
                label: member.preferredName ?? "Member",
              }))}
            leaveTeam={leaveTeam}
            transferLead={transferLead}
            disbandTeam={disbandTeamAction}
          />
        </>
      ) : (
        // Every team, not just this one: the request half picks from all of
        // them, starting on this one, and a stranger who landed on a closed
        // team can still ask another from here.
        <JoinTeamForm
          targets={await getAllTeams()}
          defaultTeamId={team.id}
          joinTeam={joinTeam}
          requestToJoin={requestToJoin}
        />
      )}
    </PageShell>
  );
}
