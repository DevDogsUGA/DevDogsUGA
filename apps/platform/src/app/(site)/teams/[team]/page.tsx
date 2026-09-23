import type { Metadata } from "next";
import { notFound } from "next/navigation";
import JoinByCodeForm from "~/components/teams/JoinByCodeForm";
import RosterActions from "~/components/teams/RosterActions";
import PageShell from "~/components/PageShell";
import { formatEventDateTime } from "~/lib/eventTime";
import {
  disbandTeamAction,
  joinTeam,
  leaveTeam,
  requestToJoin,
  transferLead,
} from "~/server/actions/teams";
import { requireSession } from "~/server/auth/require";
import { getTeamDetail } from "~/server/loaders/teams";
import Badge from "~/ui/badge";
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
 * A persistent project team, not a per-competition roster -- see the
 * platform redesign's teams-core step. There is no roster lock to render any
 * more: the only ceilings are the size and concurrent-team caps, both
 * enforced when a join is attempted rather than displayed as a state of the
 * page.
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

  return (
    <PageShell
      accent="emerald"
      title={team.name}
      description={`${team.members.length} ${team.members.length === 1 ? "member" : "members"}`}
    >
      <ConsoleCard.Root id="roster">
        <ConsoleCard.Header title="Roster" />
        <ConsoleCard.Content>
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
      ) : (
        <JoinPanel team={team} />
      )}
    </PageShell>
  );
}

type TeamDetail = NonNullable<Awaited<ReturnType<typeof getTeamDetail>>>;

/**
 * How a stranger gets on. `JoinByCodeForm` itself decides whether the
 * "ask to join" half renders, from `acceptingRequests` -- the join code
 * always works regardless, so this never hides the whole panel.
 */
function JoinPanel({ team }: { team: TeamDetail }) {
  return (
    <JoinByCodeForm
      targets={[
        {
          id: team.id,
          name: team.name,
          acceptingRequests: team.acceptingRequests,
        },
      ]}
      joinTeam={joinTeam}
      requestToJoin={requestToJoin}
    />
  );
}
