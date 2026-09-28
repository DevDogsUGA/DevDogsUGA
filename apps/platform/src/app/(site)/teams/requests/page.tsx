import type { Metadata } from "next";
import Link from "next/link";
import EmptyState from "~/components/participation/EmptyState";
import RequestActions from "~/components/teams/RequestActions";
import PageShell from "~/components/PageShell";
import Callout from "~/ui/callout";
import { ConsoleCard } from "~/ui/card";
import { formatEventDateTime, formatRelative } from "~/lib/eventTime";
import { respondToMembership } from "~/server/actions/teams";
import { requireSession } from "~/server/auth/require";
import {
  getAllTeams,
  getMyTeams,
  getPendingForUser,
  type PendingRequest,
  type TeamCard,
} from "~/server/loaders/teams";
import { MAX_CONCURRENT_TEAMS_PER_USER } from "~/server/teams/limits";

/**
 * A queue addressed to one person: `requireSession()` below redirects
 * anonymous visitors to `/auth`, and what a signed-in member sees is theirs
 * alone. The title is the label `config/nav.ts` gives it in the profile
 * popover.
 */
export const metadata: Metadata = {
  title: "Team requests | DevDogs",
  robots: { index: false },
};

/**
 * /teams/requests: everything waiting on the viewer to decide.
 *
 * Invitations addressed to them and join requests on the teams they lead are
 * two halves of one table and one screen, because they are one question: what
 * do I have to answer. Splitting them by direction would mean checking two
 * places to find out whether anything is outstanding.
 *
 * Beyond listing, it decides whether each row can still be accepted.
 * Acceptance is validated when answered, never when created: the
 * concurrent-team cap and the team's roster can both have changed since a
 * request was opened. A row can be dead on arrival, and this page exists so
 * nobody finds that out by pressing Accept and getting an error.
 */

interface Row {
  request: PendingRequest;
  /** The team, from the all-teams list. Null if it has since been disbanded. */
  card: TeamCard | null;
  /** How many teams the person this row would add is active on right now. */
  joinerActiveTeamCount: number;
}

export default async function TeamRequestsPage() {
  const userId = await requireSession();
  const pending = await getPendingForUser(userId);
  const cards = await getAllTeams();

  const rows: Row[] = await Promise.all(
    pending.map(async (request) => {
      // Asked about the person the row would ADD, not about the viewer. For
      // an invitation those are the same person; for a join request the
      // difference is the whole check: the asker may have filled their own
      // cap while the lead was deciding.
      const joinerTeams = await getMyTeams(request.userId);
      return {
        request,
        card: cards.find((card) => card.id === request.teamId) ?? null,
        joinerActiveTeamCount: joinerTeams.length,
      };
    }),
  );

  const invitations = rows.filter((row) => row.request.direction === "invite");
  const requests = rows.filter((row) => row.request.direction === "request");

  return (
    <PageShell
      accent="amber"
      title="Invitations and requests"
      description="Invitations to you, and people asking to join a team you lead."
    >
      {rows.length === 0 ? (
        <EmptyState
          title="Nothing to answer"
          body="No invitations are open for you, and nobody is waiting on a team you lead. Invitations arrive by email too, so this page is not the only place you would hear about one."
        />
      ) : (
        <>
          {invitations.length > 0 && (
            <ConsoleCard.Root id="invitations">
              <ConsoleCard.Header
                title="Invitations to You"
                description={`Several at once is fine — you can be active on up to ${MAX_CONCURRENT_TEAMS_PER_USER} teams, so accepting one does not automatically clear the rest. Accepting past that cap fails at the button; decline the ones you do not want to keep pending.`}
              />
              <ConsoleCard.Content>
                <ul className="flex flex-col gap-3">
                  {invitations.map((row) => (
                    <RequestCard key={row.request.id} row={row} />
                  ))}
                </ul>
              </ConsoleCard.Content>
            </ConsoleCard.Root>
          )}

          {requests.length > 0 && (
            <ConsoleCard.Root id="requests">
              <ConsoleCard.Header title="Asking to Join Your Team" />
              <ConsoleCard.Content>
                <ul className="flex flex-col gap-3">
                  {requests.map((row) => (
                    <RequestCard key={row.request.id} row={row} />
                  ))}
                </ul>
              </ConsoleCard.Content>
            </ConsoleCard.Root>
          )}
        </>
      )}
    </PageShell>
  );
}

function RequestCard({ row }: { row: Row }) {
  const { request, card } = row;
  const isInvite = request.direction === "invite";
  const teamHref = card === null ? "/teams" : `/teams/${card.slug}`;
  const subject = isInvite
    ? request.teamName
    : (request.preferredName ?? "A member");
  const blocker = blockerFor(row);

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/5 p-4 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold text-white">
          {isInvite ? (
            <>
              <Link href={teamHref} className="underline">
                {request.teamName}
              </Link>{" "}
              invited you
            </>
          ) : (
            <>
              {subject} wants to join{" "}
              <Link href={teamHref} className="underline">
                {request.teamName}
              </Link>
            </>
          )}
        </span>
        <span className="text-xs text-mauve-400">
          <time dateTime={request.createdAt.toISOString()}>
            {formatRelative(request.createdAt)}
          </time>
          , {formatEventDateTime(request.createdAt)}
        </span>
      </div>

      {request.message !== null && (
        <blockquote className="border-l-2 border-mauve-700 pl-3 text-sm text-mauve-300">
          {request.message}
        </blockquote>
      )}

      {card !== null && (
        <p className="text-xs text-mauve-400">
          {card.memberCount} {card.memberCount === 1 ? "member" : "members"} on
          the roster right now.
        </p>
      )}

      {blocker !== null && (
        <Callout tone="warning" title={blocker.title}>
          {blocker.body}
        </Callout>
      )}

      <RequestActions
        requestId={request.id}
        direction={request.direction}
        subject={subject}
        teamHref={teamHref}
        blocked={blocker !== null}
        respond={respondToMembership}
      />
    </li>
  );
}

/**
 * Why accepting would fail, in the words of whoever is reading it.
 *
 * Returns null when it would work. Everything checked here is checked again
 * inside the transaction. This is not the enforcement, it is the difference
 * between being told and being surprised.
 *
 * One thing it cannot answer: whether the team is FULL. `requireCanJoin`
 * resolves that against `MAX_TEAM_SIZE` and no loader on this path counts the
 * roster for a team the viewer may not be on. A full team therefore still
 * fails at the button with `team_full`.
 */
function blockerFor({
  request,
  card,
  joinerActiveTeamCount,
}: Row): { title: string; body: string } | null {
  const isInvite = request.direction === "invite";
  const who = request.preferredName ?? "They";

  if (card === null) {
    return {
      title: "That team is no longer listed",
      body: "It may have been disbanded. There is nothing left to join, so declining is all this row is good for.",
    };
  }

  if (joinerActiveTeamCount >= MAX_CONCURRENT_TEAMS_PER_USER) {
    return isInvite
      ? {
          title: `You are already active on ${MAX_CONCURRENT_TEAMS_PER_USER} teams`,
          body: "That is the most one contributor can be on at once, so this invitation can no longer be accepted without leaving another team first. Declining it just clears it from the list.",
        }
      : {
          title: `${who} reached the team cap`,
          body: `${who === "They" ? "They are" : `${who} is`} already active on ${MAX_CONCURRENT_TEAMS_PER_USER} teams, so this request cannot be accepted. Declining it lets them know.`,
        };
  }

  return null;
}
