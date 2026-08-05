import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import ConsolePageShell from "~/components/ConsolePageShell";
import LockNotice from "~/components/participation/LockNotice";
import JoinByCodeForm from "~/components/teams/JoinByCodeForm";
import { formatEventDateTime } from "~/lib/eventTime";
import { joinTeam, requestToJoin } from "~/server/actions/teams";
import { expectSession } from "~/server/auth";
import { getCompetitionBySlug } from "~/server/loaders/meetings";
import { getMyTeam, getTeamDetail } from "~/server/loaders/teams";
import { canUnlockByClosingPr } from "~/server/teams/lockState";

/**
 * /competitions/[slug]/teams/[team] — one team.
 *
 * Public, on purpose: finding a team you are not on is the point of the list
 * this hangs off. What changes for a member is one thing — the join code —
 * and it is the loader that decides that, not this page. See below.
 */

export default async function TeamPage({
  params,
}: {
  params: Promise<{ slug: string; team: string }>;
}) {
  // The lock is derived from the clock: judging starting is what freezes this
  // page, and a prerendered copy would still be offering a join form.
  await connection();

  const { slug, team: teamSlug } = await params;
  const userId = await expectSession().catch(() => redirect("/auth"));

  const team = await getTeamDetail(slug, teamSlug, userId);
  if (!team) notFound();

  const isMember = team.members.some((member) => member.userId === userId);
  const mine = await getMyTeam(slug, userId);
  // Only for the name. A competition is called after its project and carries
  // no name of its own, and `TeamDetail` carries the slug rather than either.
  const competition = await getCompetitionBySlug(slug);

  // `canUnlockByClosingPr` wants the raw columns; `TeamDetail` carries the
  // reason the loader already derived from them. Passing nulls for the two it
  // does not expose is sound only because `lockReason` ordered them first: a
  // team whose reason came back "entry" is by construction neither manually
  // locked nor past judging, so the reconstruction cannot disagree with the
  // real row. It matters that this is computed rather than assumed — a merged
  // entry also reads "entry", and closing a pull request does not bring that
  // one back, so the notice must not offer it.
  const closingPrWouldUnlock =
    team.lock === "entry" &&
    canUnlockByClosingPr({
      submissionState: team.submissionState,
      lockedManuallyAt: null,
      judgingStartsAt: null,
    });

  return (
    <ConsolePageShell
      accent="emerald"
      title={team.name}
      description={
        <>
          {team.members.length}{" "}
          {team.members.length === 1 ? "member" : "members"}
          {team.maxTeamSize !== null && ` of ${team.maxTeamSize}`} ·{" "}
          <Link href={`/competitions/${slug}/teams`} className="underline">
            every team in {competition?.name ?? "this competition"}
          </Link>
        </>
      }
    >
      {team.lock !== null && (
        <LockNotice
          reason={team.lock}
          canUnlockByClosingPr={closingPrWouldUnlock}
        />
      )}

      <section className="rounded-sm border-2 border-black bg-white p-4">
        <h2 className="mb-3 font-semibold">Roster</h2>
        <ul className="flex flex-col gap-2 text-sm">
          {team.members.map((member) => (
            <li
              key={member.userId}
              className="flex flex-wrap items-baseline justify-between gap-2"
            >
              <span className="font-semibold">
                {/* A profile with no preferred name set is a real state — the
                    field is optional — and showing a raw user id instead would
                    be both uglier and more identifying than saying nothing. */}
                {member.preferredName ?? "Member"}
                {member.userId === userId && (
                  <span className="ml-2 text-xs font-normal opacity-70">
                    you
                  </span>
                )}
                {member.role === "lead" && (
                  <span className="ml-2 rounded-full border border-black/40 px-2 py-0.5 text-xs font-normal opacity-70">
                    Lead
                  </span>
                )}
              </span>
              <time
                dateTime={member.joinedAt.toISOString()}
                className="text-xs opacity-70"
              >
                joined {formatEventDateTime(member.joinedAt)}
              </time>
            </li>
          ))}
        </ul>
      </section>

      <Entry team={team} />

      {/* The loader returns `joinCode: null` to everybody who is not on this
          team, and that null IS the access control — there is no second way to
          ask for it. Rendering the block only when it is non-null keeps that
          the single decision rather than re-deciding "is this person a member"
          here, where it could get the answer wrong. */}
      {team.joinCode !== null && (
        <section className="rounded-sm border-2 border-black bg-white p-4">
          <h2 className="font-semibold">Join code</h2>
          <p className="my-2 font-mono text-2xl font-bold tracking-widest">
            {team.joinCode}
          </p>
          <p className="text-sm opacity-70">
            Anybody holding this can walk onto the team while the roster is
            open, so give it out rather than post it. No characters that get
            misheard — no zero, no letter O.
          </p>
        </section>
      )}

      {team.standing !== null && (
        <section className="rounded-sm border-2 border-black bg-white p-4">
          <h2 className="mb-3 font-semibold">
            Finished {ordinal(team.standing.placement)}
          </h2>
          <dl className="flex flex-wrap gap-6 text-sm">
            <Figure
              label="Requirements"
              value={team.standing.requirementPoints}
            >
              points
            </Figure>
            <Figure label="Election" value={team.standing.electionPoints}>
              points
            </Figure>
            <Figure label="Total" value={team.standing.totalPoints}>
              points
            </Figure>
          </dl>
        </section>
      )}

      {!isMember && <JoinPanel {...{ team, mine, slug }} />}
    </ConsolePageShell>
  );
}

type TeamDetail = NonNullable<Awaited<ReturnType<typeof getTeamDetail>>>;

/**
 * The entry, which is a pull request.
 *
 * Kept next to the roster rather than hidden behind the lock notice, because
 * the two are the same fact seen from opposite ends: the entry being open is
 * *why* the roster is closed, and a team deciding whether to close it needs
 * both in one glance.
 */
function Entry({ team }: { team: TeamDetail }) {
  return (
    <section className="rounded-sm border-2 border-black bg-white p-4 text-sm">
      <h2 className="mb-2 font-semibold">Entry</h2>

      {team.submissionState === null ? (
        <p className="opacity-70">
          No pull request yet. Opening one from the team&rsquo;s branch is how a
          team enters — and it closes the roster while it is open.
        </p>
      ) : (
        <p>
          {ENTRY_COPY[team.submissionState]}
          {team.submissionUrl !== null && (
            <>
              {" "}
              <a
                href={team.submissionUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="underline"
              >
                View the pull request
              </a>
              .
            </>
          )}
        </p>
      )}

      {team.competedAt !== null && (
        <p className="mt-2">
          Frozen at judging on{" "}
          <time dateTime={team.competedAt.toISOString()}>
            {formatEventDateTime(team.competedAt)}
          </time>
          . Everybody on the roster at that moment competed, and closing the
          pull request afterwards does not take that away.
        </p>
      )}

      <p className="mt-2 opacity-70">
        {/* Null is "not graded yet", not zero. Officers fill this in after the
            fact, so an unscored team must not read as one that met nothing. */}
        {team.requirementsMet === null
          ? "Requirements have not been graded yet."
          : `${team.requirementsMet} requirements met.`}
      </p>
    </section>
  );
}

const ENTRY_COPY: Record<"open" | "closed" | "merged", string> = {
  open: "The pull request is open, which is what has the roster closed.",
  closed:
    "The pull request is closed, so the roster is open again — reopen it when the team is ready.",
  merged:
    "The pull request was merged. A merged entry is still an entry, so the roster stays closed.",
};

/**
 * How a stranger gets on, or why they cannot.
 *
 * Every branch here answers with a state of the world rather than with an
 * error, because none of them are mistakes: being on another team already is
 * the rule working, and a locked roster is a team that has entered.
 */
function JoinPanel({
  team,
  mine,
  slug,
}: {
  team: TeamDetail;
  mine: { teamSlug: string; role: "lead" | "member" } | null;
  slug: string;
}) {
  if (mine !== null) {
    return (
      <p className="rounded-sm border-2 border-black bg-white p-4 text-sm">
        You are already on a team for this competition — it is one per member —
        so this one is not open to you.{" "}
        <Link
          href={`/competitions/${slug}/teams/${mine.teamSlug}`}
          className="underline"
        >
          Open your team
        </Link>
        .
      </p>
    );
  }

  // A locked roster already has the notice at the top of the page saying which
  // of the three reasons it is and what, if anything, undoes it. Repeating it
  // down here would say it worse.
  if (team.lock !== null) return null;

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

function Figure({
  label,
  value,
  children,
}: {
  label: string;
  value: number;
  children: string;
}) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs tracking-wide uppercase opacity-60">{label}</dt>
      <dd className="text-2xl font-bold tabular-nums">
        {value}
        <span className="ml-1 text-xs font-normal opacity-60">{children}</span>
      </dd>
    </div>
  );
}

/** 1st, 2nd, 3rd — including the 11th/12th/13th exceptions. */
function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  const suffix = ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${suffix}`;
}
