import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import PageShell from "~/components/PageShell";
import EmptyState from "~/components/participation/EmptyState";
import { LockChip } from "~/components/participation/LockNotice";
import CreateTeamForm from "~/components/teams/CreateTeamForm";
import JoinByCodeForm, {
  type JoinTarget,
} from "~/components/teams/JoinByCodeForm";
import Callout from "~/ui/callout";
import { formatEventDateTime, formatRelative } from "~/lib/eventTime";
import { createTeam, joinTeam, requestToJoin } from "~/server/actions/teams";
import { requireSession } from "~/server/auth/require";
import { getCompetitionBySlug } from "~/server/loaders/meetings";
import { getMyTeam, getTeamsForCompetition } from "~/server/loaders/teams";

/**
 * /competitions/[slug]/teams — every team, and the two ways onto one.
 *
 * The page is built around one fact: a member has exactly one team per
 * competition, or none. So it renders one of two things above the list — the
 * team they are on, or the affordances for getting on one — and never both.
 * `already_on_team` is a normal state of the world here, not an error to be
 * reported after somebody presses a button.
 */

export default async function CompetitionTeamsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  // Every lock on this page is a comparison against now — judging starting is
  // what closes a competition, and the loader computes each team's lock from
  // the current time. A prerender would freeze that at build time and show
  // open rosters for a competition that has already been judged.
  await connection();

  const { slug } = await params;
  const userId = await requireSession();

  // Identity first, and separately: `getTeamsForCompetition` answers "no such
  // competition" and "no teams yet" with the same empty array, and those need
  // opposite answers — a 404 and an invitation to start the first team.
  const competition = await getCompetitionBySlug(slug);
  if (!competition) notFound();

  // `judgingStartsAt` and `maxTeamSize` come from the loader already resolved
  // against `instance.defaultMaxTeamSize`, so this page and `requireCanJoin`
  // cannot disagree about how full a team is.
  const judgingStartsAt = competition.judgingStartsAt;
  const maxTeamSize = competition.maxTeamSize;
  // `react-hooks/purity` flags `Date.now()` because a render that gets replayed
  // could produce a different answer. That is exactly the intent here: "has
  // judging started" is a question about the current request, and the
  // `await connection()` at the top of this component is what guarantees there
  // is one -- it opts the segment out of prerendering, which is the failure the
  // rule actually protects against and which the comment there already
  // describes. Without the suppression the honest alternative is to move the
  // comparison into the loader, which hides the same call one frame deeper
  // rather than removing it.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const closed = judgingStartsAt !== null && judgingStartsAt.getTime() <= now;

  // Neither read consults the other's answer — the roster list is about the
  // competition and `getMyTeam` is about the viewer — so they go out together
  // rather than one waiting on the other.
  const [teams, mine] = await Promise.all([
    getTeamsForCompetition(slug),
    getMyTeam(slug, userId),
  ]);

  // A locked roster is not somewhere anybody can be added, so it is not a
  // target for either affordance — offering it and failing on submit would be
  // the exact drift the single lock predicate exists to prevent.
  const openTargets: JoinTarget[] = teams
    .filter((team) => team.lock === null)
    .map((team) => ({
      id: team.id,
      name: team.name,
      acceptingRequests: team.acceptingRequests,
    }));

  return (
    <PageShell
      accent="emerald"
      title={`${competition.name} — teams`}
      description={
        judgingStartsAt === null ? (
          "One team per member. Start one, or join one with the code its lead gives you."
        ) : (
          // Said in the tense it is actually in. "Rosters close when judging
          // starts, two days ago" is the sentence a single template produces,
          // and it reads as a page that has not noticed the week is over.
          <>
            {closed
              ? "Judging started "
              : "One team per member. Rosters close "}
            <time dateTime={judgingStartsAt.toISOString()}>
              {formatEventDateTime(judgingStartsAt)} (
              {formatRelative(judgingStartsAt)})
            </time>
            {closed ? "." : ", when judging starts."}
          </>
        )
      }
    >
      {mine ? (
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/5 p-4">
          <span className="flex flex-col">
            <span className="font-semibold text-white">
              You are on a team for this competition
            </span>
            <span className="text-xs text-mauve-400">
              {mine.role === "lead"
                ? "You lead it — join requests and your team's ballot are yours to answer."
                : "One team per member per competition, so this is the one."}
            </span>
          </span>
          <Link
            href={`/competitions/${slug}/teams/${mine.teamSlug}`}
            className="rounded-sm border-2 border-white bg-white px-4 py-1.5 text-sm font-medium text-black transition outline-none hover:bg-transparent hover:text-white focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-mauve-950"
          >
            Open your team
          </Link>
        </section>
      ) : closed ? (
        <Callout tone="warning">
          Judging has started for this competition, so teams can no longer be
          created or joined. The rosters below are the ones that competed.
        </Callout>
      ) : (
        <div className="grid gap-4 @2xl:grid-cols-2">
          <CreateTeamForm
            competitionId={competition.id}
            createTeam={createTeam}
          />
          {openTargets.length > 0 ? (
            <JoinByCodeForm
              targets={openTargets}
              joinTeam={joinTeam}
              requestToJoin={requestToJoin}
            />
          ) : (
            <Callout tone="info">
              No team here has an open roster right now, so there is nothing to
              join yet. Starting one is the way in.
            </Callout>
          )}
        </div>
      )}

      {teams.length === 0 ? (
        <EmptyState
          title="No teams yet"
          body="Nobody has started a team for this competition. The first one to exist is usually the one everybody else joins, so it may as well be yours."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {teams.map((team) => (
            <li
              key={team.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/5 p-4"
            >
              <span className="flex flex-col">
                <Link
                  href={`/competitions/${slug}/teams/${team.slug}`}
                  className="font-semibold text-white underline underline-offset-4 outline-none hover:text-mauve-200 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1 focus-visible:ring-offset-mauve-950"
                >
                  {team.name}
                </Link>
                <span className="text-xs text-mauve-400">
                  {`${team.memberCount} of ${maxTeamSize} members`}
                  {team.lock === null &&
                    !team.acceptingRequests &&
                    " · not taking join requests"}
                </span>
              </span>
              <LockChip reason={team.lock} />
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
