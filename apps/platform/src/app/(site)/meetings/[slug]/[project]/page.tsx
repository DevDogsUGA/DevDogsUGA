import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { ReactNode } from "react";
import ConsolePageShell from "~/components/ConsolePageShell";
import EmptyState from "~/components/participation/EmptyState";
import { StarBadges } from "~/components/participation/StarBadges";
import {
  formatEventDateTime,
  formatEventSpan,
  formatRelative,
} from "~/lib/eventTime";
import { getWorkshopDetail } from "~/server/loaders/meetings";
import { getStarsForWorkshop } from "~/server/loaders/stars";

/**
 * /meetings/[slug]/[project] — one workshop.
 *
 * A workshop is a project taught at a meeting, so it is addressed by the pair
 * rather than by an id: the same project runs again in a later semester and the
 * URL says which time it was.
 *
 * Public, like the meeting it belongs to.
 */
export default async function WorkshopPage({
  params,
}: {
  params: Promise<{ slug: string; project: string }>;
}) {
  // `formatRelative` on the judging deadline reads the clock.
  await connection();

  const { slug, project } = await params;
  const detail = await getWorkshopDetail(slug, project);
  if (!detail) notFound();

  const stars = await getStarsForWorkshop(detail.workshopId);
  const earned = {
    workshop: stars.filter((star) => star.workshopStar).length,
    competed: stars.filter((star) => star.competitionStar).length,
    won: stars.filter((star) => star.won).length,
  };

  const { competition, meeting } = detail;

  return (
    <ConsolePageShell
      accent="emerald"
      title={detail.projectName}
      description={
        <>
          Ran at{" "}
          <Link href={`/meetings/${meeting.slug}`} className="underline">
            {meeting.name}
          </Link>
          {" · "}
          <time dateTime={meeting.startsAt.toISOString()}>
            {formatEventSpan(meeting.startsAt, meeting.endsAt)}
          </time>
        </>
      }
    >
      {competition === null ? (
        /*
         * No competition is a shape, not a gap.
         *
         * A supplementary workshop is finished the moment it is over: showing
         * up is the whole of it and it is worth one star. Rendering an empty
         * "Competition" section here — or an EmptyState, which exists to say
         * "not yet" — would tell members something false about a session that
         * is complete.
         */
        <section className="flex flex-col gap-2 rounded-sm border-2 border-black bg-white p-4">
          <h2 className="font-semibold">A workshop on its own</h2>
          <p className="max-w-prose text-sm">
            Nothing to enter and nothing to build against a deadline. Being in
            the room is the whole of this one, and it is worth one star.
          </p>
        </section>
      ) : (
        <section className="flex flex-col gap-3 rounded-sm border-2 border-black bg-white p-4">
          <h2 className="font-semibold">The competition</h2>

          <dl className="grid gap-3 text-sm @sm:grid-cols-2">
            <Fact label="Judging">
              {competition.judgingStartsAt === null ? (
                // Null is "not scheduled yet", and it is load-bearing: judging
                // is what freezes every entry, so a team reading this needs to
                // know the deadline is genuinely unset rather than passed.
                "Not scheduled yet"
              ) : (
                <time dateTime={competition.judgingStartsAt.toISOString()}>
                  {formatEventDateTime(competition.judgingStartsAt)} (
                  {formatRelative(competition.judgingStartsAt)})
                </time>
              )}
            </Fact>

            <Fact label="Teams">
              {competition.teamCount === 1
                ? "1 team"
                : `${competition.teamCount} teams`}
              {competition.maxTeamSize !== null &&
                ` · up to ${competition.maxTeamSize} per team`}
            </Fact>

            {competition.requirementCount !== null && (
              <Fact label="Requirements">
                {competition.requirementCount === 1
                  ? "1 requirement"
                  : `${competition.requirementCount} requirements`}
              </Fact>
            )}
          </dl>

          <p className="text-sm">
            <Link
              href={`/competitions/${competition.slug}/teams`}
              className="rounded-sm border-2 border-black bg-black px-3 py-1.5 font-semibold text-white"
            >
              See the teams
            </Link>
          </p>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">What was earned here</h2>

        {stars.length === 0 ? (
          <EmptyState
            title="Nothing recorded yet"
            body="Stars appear here as members check in, and for the competition once judging freezes the entries."
          />
        ) : (
          <dl className="flex flex-col gap-2 rounded-sm border-2 border-black bg-white p-4 text-sm">
            {/*
             * Counts, not a roster. `getStarsForWorkshop` returns user ids
             * with no name attached (see the report), so there is nobody to
             * list — and the counts are the honest version of what this page
             * can say.
             *
             * The badges are lit cumulatively because the stars nest: whoever
             * competed was also, by definition, at the workshop.
             */}
            <Tally
              count={earned.workshop}
              workshopStar
              competitionStar={false}
              won={false}
            >
              earned the workshop star
            </Tally>

            {competition !== null && (
              <>
                <Tally
                  count={earned.competed}
                  workshopStar
                  competitionStar
                  won={false}
                >
                  competed
                </Tally>
                <Tally count={earned.won} workshopStar competitionStar won>
                  won
                </Tally>
              </>
            )}
          </dl>
        )}
      </section>

      <Link href={`/meetings/${meeting.slug}`} className="text-sm underline">
        Back to {meeting.name}
      </Link>
    </ConsolePageShell>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs tracking-wide uppercase opacity-60">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Tally({
  count,
  workshopStar,
  competitionStar,
  won,
  children,
}: {
  count: number;
  workshopStar: boolean;
  competitionStar: boolean;
  won: boolean;
  children: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <dt className="flex items-center gap-2">
        <StarBadges
          workshopStar={workshopStar}
          competitionStar={competitionStar}
          won={won}
          size="sm"
        />
        <span className="opacity-70">{children}</span>
      </dt>
      <dd className="font-semibold tabular-nums">{count}</dd>
    </div>
  );
}
