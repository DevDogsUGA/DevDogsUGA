import type { Metadata } from "next";
import Link from "next/link";
import CreateTeamForm from "~/components/teams/CreateTeamForm";
import JoinTeamForm, { type JoinTarget } from "~/components/teams/JoinTeamForm";
import EmptyState from "~/components/participation/EmptyState";
import PageShell from "~/components/PageShell";
import Badge from "~/ui/badge";
import Callout from "~/ui/callout";
import { ConsoleCard } from "~/ui/card";
import { createTeam, joinTeam, requestToJoin } from "~/server/actions/teams";
import { requireSession } from "~/server/auth/require";
import { getAllTeams, getMyTeams } from "~/server/loaders/teams";
import { MAX_CONCURRENT_TEAMS_PER_USER } from "~/server/teams/limits";

/**
 * `requireSession()` below sends an anonymous visitor to `/auth`, so this
 * route has no public rendering.
 */
export const metadata: Metadata = {
  title: "Teams | DevDogs",
  robots: { index: false },
};

/**
 * /teams: every team, and the two ways onto one.
 *
 * A team is a persistent project team, not a per-competition roster. A
 * member can be active on up to `MAX_CONCURRENT_TEAMS_PER_USER` teams at
 * once, so "your teams" is a list, not a single card.
 */
export default async function TeamsPage() {
  const userId = await requireSession();

  const [mine, teams] = await Promise.all([getMyTeams(userId), getAllTeams()]);

  const atCap = mine.length >= MAX_CONCURRENT_TEAMS_PER_USER;

  // Every team is a request target; one closed to requests is listed but not
  // pickable. Whether there is room, and whether the caller is under their
  // own cap, are both checked when the form is submitted, not here -- see
  // `requireCanJoin`.
  const targets: JoinTarget[] = teams.map((team) => ({
    id: team.id,
    name: team.name,
    acceptingRequests: team.acceptingRequests,
  }));

  return (
    <PageShell
      accent="emerald"
      title="Teams"
      description={`Start one, or join one with the code its lead gives you. Active on at most ${MAX_CONCURRENT_TEAMS_PER_USER} at a time.`}
    >
      {mine.length > 0 && (
        <ConsoleCard.Root id="mine">
          <ConsoleCard.Header title="Your Teams" />
          <ConsoleCard.Content>
            <ul className="flex flex-col gap-3">
              {mine.map((team) => (
                <li
                  key={team.teamId}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/5 p-4"
                >
                  <span className="flex items-center gap-2">
                    <Link
                      href={`/teams/${team.teamSlug}`}
                      className="font-semibold text-white underline underline-offset-4 outline-none hover:text-mauve-200 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-mauve-950"
                    >
                      {team.teamName}
                    </Link>
                    {team.role === "lead" && (
                      <Badge variant="info" className="font-normal">
                        Lead
                      </Badge>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </ConsoleCard.Content>
        </ConsoleCard.Root>
      )}

      {atCap ? (
        <Callout tone="info" title="You are on as many teams as you can be">
          You are already active on {mine.length} teams, the most one
          contributor can be on at once, so creating or joining another is not
          offered here. Leave one first if you want to swap.
        </Callout>
      ) : (
        <div className="grid gap-4 @2xl:grid-cols-2">
          <CreateTeamForm createTeam={createTeam} />
          {targets.length > 0 ? (
            <JoinTeamForm
              targets={targets}
              joinTeam={joinTeam}
              requestToJoin={requestToJoin}
            />
          ) : (
            <EmptyState
              title="No teams yet"
              body="Nobody has started a team. The first one to exist is usually the one everybody else joins, so it may as well be yours."
            />
          )}
        </div>
      )}

      {teams.length === 0 ? null : (
        <ConsoleCard.Root id="all">
          <ConsoleCard.Header title="All Teams" />
          <ConsoleCard.Content>
            <ul className="flex flex-col gap-3">
              {teams.map((team) => (
                <li
                  key={team.id}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/5 p-4"
                >
                  <span className="flex flex-col">
                    <Link
                      href={`/teams/${team.slug}`}
                      className="font-semibold text-white underline underline-offset-4 outline-none hover:text-mauve-200 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-mauve-950"
                    >
                      {team.name}
                    </Link>
                    <span className="text-xs text-mauve-400">
                      {`${team.memberCount} member${team.memberCount === 1 ? "" : "s"}`}
                      {!team.acceptingRequests && " · not taking join requests"}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </ConsoleCard.Content>
        </ConsoleCard.Root>
      )}
    </PageShell>
  );
}
