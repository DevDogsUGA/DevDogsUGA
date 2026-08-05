import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import ConsolePageShell from "~/components/ConsolePageShell";
import EmptyState from "~/components/participation/EmptyState";
import { LOCK_COPY } from "~/components/participation/LockNotice";
import RequestActions from "~/components/teams/RequestActions";
import { formatEventDateTime, formatRelative } from "~/lib/eventTime";
import { respondToMembership } from "~/server/actions/teams";
import { expectSession } from "~/server/auth";
import { getCompetitionBySlug } from "~/server/loaders/meetings";
import {
  getMyTeam,
  getPendingForUser,
  getTeamsForCompetition,
  type PendingRequest,
  type TeamCard,
} from "~/server/loaders/teams";
import type { LockReason } from "~/server/teams/lockState";

/**
 * /teams/requests — everything waiting on the viewer to decide.
 *
 * Invitations addressed to them and join requests on the teams they lead are
 * two halves of one table and one screen, because they are one question: what
 * do I have to answer. Splitting them by direction would mean checking two
 * places to find out whether anything is outstanding.
 *
 * The work this page does beyond listing is deciding whether each row can
 * still be accepted. Acceptance is validated when it is answered, never when
 * it was created — the team can fill up, the roster can lock, or the person
 * can join somebody else in between — so a row can be dead on arrival, and
 * finding that out by pressing Accept and getting an error is the experience
 * this page exists to avoid.
 */

interface Row {
  request: PendingRequest;
  /** The team, from its competition's list. Null if it has since vanished. */
  card: TeamCard | null;
  /** What the competition is called. `PendingRequest` carries only its slug. */
  competitionName: string;
  /** The team the person this row would add is already on, if any. */
  joinerTeam: { teamSlug: string; role: "lead" | "member" } | null;
}

export default async function TeamRequestsPage() {
  // Whether a roster is locked is a comparison against now — the same reason
  // the team pages opt out of prerendering.
  await connection();

  const userId = await expectSession().catch(() => redirect("/auth"));
  const pending = await getPendingForUser(userId);

  const rows: Row[] = await Promise.all(
    pending.map(async (request) => {
      // The pending row carries a team id and a name but no team SLUG, so the
      // competition's list is also what makes each of these linkable. Both
      // loaders are `cache`d per argument, so several rows in one competition
      // cost one query between them.
      const cards = await getTeamsForCompetition(request.competitionSlug);
      const competition = await getCompetitionBySlug(request.competitionSlug);
      return {
        request,
        card: cards.find((card) => card.id === request.teamId) ?? null,
        competitionName: competition?.name ?? request.competitionSlug,
        // Asked about the person the row would ADD, not about the viewer. For
        // an invitation those are the same person; for a join request the
        // difference is the whole check — the asker may have joined somebody
        // else while the lead was deciding.
        joinerTeam: await getMyTeam(request.competitionSlug, request.userId),
      };
    }),
  );

  const invitations = rows.filter((row) => row.request.direction === "invite");
  const requests = rows.filter((row) => row.request.direction === "request");

  return (
    <ConsolePageShell
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
            <section className="flex flex-col gap-3">
              <h2 className="px-1 font-semibold">Invitations to you</h2>
              {/* Deliberately does not promise that accepting withdraws the
                  rest. The design says it should; `respondToMembership` marks
                  only the row it answered, so the others stay pending and turn
                  into the blocked rows below. Describing the intent rather
                  than the behaviour would leave a member waiting for teams to
                  hear something the platform never sent. */}
              <p className="max-w-prose px-1 text-sm opacity-70">
                Several at once is fine and rather the point — ask a few, join
                whichever answers first. You can only be on one team per
                competition, so the moment you accept one the rest stop being
                acceptable; decline those to let the leads know.
              </p>
              <ul className="flex flex-col gap-3">
                {invitations.map((row) => (
                  <RequestCard key={row.request.id} row={row} />
                ))}
              </ul>
            </section>
          )}

          {requests.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="px-1 font-semibold">Asking to join your team</h2>
              <ul className="flex flex-col gap-3">
                {requests.map((row) => (
                  <RequestCard key={row.request.id} row={row} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </ConsolePageShell>
  );
}

function RequestCard({ row }: { row: Row }) {
  const { request, card, competitionName } = row;
  const isInvite = request.direction === "invite";
  const teamHref = `/competitions/${request.competitionSlug}/teams${
    card === null ? "" : `/${card.slug}`
  }`;
  const subject = isInvite
    ? request.teamName
    : (request.preferredName ?? "A member");
  const blocker = blockerFor(row);

  return (
    <li className="flex flex-col gap-3 rounded-sm border-2 border-black bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold">
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
        <span className="text-xs opacity-70">
          {/* Named, because "you were invited to a team" is not enough to
              decide with — which competition it is for is half the question,
              and a member may be looking at two weeks' worth at once. */}
          {competitionName} ·{" "}
          <time dateTime={request.createdAt.toISOString()}>
            {formatRelative(request.createdAt)}
          </time>
          , {formatEventDateTime(request.createdAt)}
        </span>
      </div>

      {request.message !== null && (
        <blockquote className="border-l-2 border-black/20 pl-3 text-sm">
          {request.message}
        </blockquote>
      )}

      {card !== null && (
        <p className="text-xs opacity-70">
          {card.memberCount} {card.memberCount === 1 ? "member" : "members"} on
          the roster right now.
        </p>
      )}

      {blocker !== null && (
        <div className="rounded-sm border-2 border-black bg-amber-50 p-3">
          <p className="text-sm font-semibold">{blocker.title}</p>
          <p className="mt-1 text-sm">{blocker.body}</p>
        </div>
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
 * inside the transaction — this is not the enforcement, it is the difference
 * between being told and being surprised.
 *
 * One thing it cannot answer: whether the team is FULL. The cap is
 * `competitions.maxTeamSize`, and where that is null the real limit comes from
 * the instance default, neither of which any loader on this path exposes. A
 * full team therefore still fails at the button with `team_full`.
 */
function blockerFor({
  request,
  card,
  joinerTeam,
}: Row): { title: string; body: string } | null {
  const isInvite = request.direction === "invite";
  const who = request.preferredName ?? "They";

  if (joinerTeam !== null) {
    return isInvite
      ? {
          title: "You are already on a team for this competition",
          body: "It is one team per member per competition, so this invitation can no longer be accepted. Declining it just clears it from the list.",
        }
      : {
          title: `${who} joined another team`,
          body: "They are on a team for this competition already, so this request cannot be accepted. Declining it lets them know.",
        };
  }

  if (card === null) {
    return {
      title: "That team is no longer listed",
      body: "It may have been removed. There is nothing left to join, so declining is all this row is good for.",
    };
  }

  if (card.lock !== null) {
    // The lead gets the standard copy, which is written in the second person
    // possessive — "your entry is open". An invitee is not on the team, so
    // that reading is wrong for them, and the temporary case matters more to
    // them anyway: an entry lock is the one that can come back.
    return isInvite
      ? INVITEE_LOCK_COPY[card.lock]
      : { title: LOCK_COPY[card.lock].title, body: LOCK_COPY[card.lock].body };
  }

  return null;
}

const INVITEE_LOCK_COPY: Record<LockReason, { title: string; body: string }> = {
  entry: {
    title: "That roster is closed while their entry is open",
    body: "A team's pull request closes its roster. This invitation is not dead — if they close the pull request to make room, it can be accepted again.",
  },
  judging: {
    title: "Judging has started",
    body: "Rosters close when judging begins and do not reopen, so this invitation can no longer be accepted.",
  },
  officer: {
    title: "An officer locked that roster",
    body: "Nobody can be added until it is unlocked. The team's lead is the one to ask about it.",
  },
};
