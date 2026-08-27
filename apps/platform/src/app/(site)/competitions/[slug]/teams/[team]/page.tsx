import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import PageShell from "~/components/PageShell";
import LockNotice from "~/components/participation/LockNotice";
import JoinByCodeForm from "~/components/teams/JoinByCodeForm";
import { formatEventDateTime } from "~/lib/eventTime";
import { joinTeam, requestToJoin } from "~/server/actions/teams";
import { requireSession } from "~/server/auth/require";
import { getCompetitionBySlug } from "~/server/loaders/meetings";
import { getMyTeam, getTeamDetail } from "~/server/loaders/teams";
import { canUnlockByClosingPr } from "~/server/teams/lockState";
import Badge from "~/ui/badge";
import Callout from "~/ui/callout";
import { ConsoleCard } from "~/ui/card";

/**
 * "Public" in the comment below means public to members — the page exists so
 * somebody can find a team they are not on — and `expectSession()` is still the
 * door. What a crawler would get is the `/auth` redirect, and what it must
 * never get is the join code the loader reveals to a member.
 */
export const metadata: Metadata = {
  title: "Team | DevDogs",
  robots: { index: false },
};

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
  const userId = await requireSession();

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
    <PageShell
      accent="emerald"
      title={team.name}
      description={
        <>
          {team.members.length}{" "}
          {team.members.length === 1 ? "member" : "members"}
          {team.maxTeamSize !== null && ` of ${team.maxTeamSize}`} ·{" "}
          <Link
            href={`/competitions/${slug}/teams`}
            className="text-white underline"
          >
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
                  {/* A profile with no preferred name set is a real state — the
                      field is optional — and showing a raw user id instead would
                      be both uglier and more identifying than saying nothing. */}
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

      <Entry team={team} />

      {/* The loader returns `joinCode: null` to everybody who is not on this
          team, and that null IS the access control — there is no second way to
          ask for it. Rendering the block only when it is non-null keeps that
          the single decision rather than re-deciding "is this person a member"
          here, where it could get the answer wrong. */}
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
                Anybody holding this can walk onto the team while the roster is
                open, so give it out rather than post it. No characters that get
                misheard — no zero, no letter O.
              </p>
            </div>
          </ConsoleCard.Content>
        </ConsoleCard.Root>
      )}

      {team.standing !== null && (
        <ConsoleCard.Root id="standing">
          <ConsoleCard.Header
            title={`Finished ${ordinal(team.standing.placement)}`}
          />
          <ConsoleCard.Content>
            <dl className="flex flex-wrap gap-6">
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
          </ConsoleCard.Content>
        </ConsoleCard.Root>
      )}

      {!isMember && <JoinPanel {...{ team, mine, slug }} />}
    </PageShell>
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
    <ConsoleCard.Root id="entry">
      <ConsoleCard.Header title="Entry" />
      {/* Two children on purpose: the divider then falls between the state of
          the pull request and the requirement count, which is graded
          separately and long afterwards. */}
      <ConsoleCard.Content>
        <div className="flex flex-col gap-2 text-sm">
          {team.submissionState === null ? (
            <p className="text-mauve-400">
              No pull request yet. Opening one from the team&rsquo;s branch is
              how a team enters — and it closes the roster while it is open.
            </p>
          ) : (
            <p className="text-mauve-300">
              {ENTRY_COPY[team.submissionState]}
              {team.submissionUrl !== null && (
                <>
                  {" "}
                  <a
                    href={team.submissionUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-white underline"
                  >
                    View the pull request
                  </a>
                  .
                </>
              )}
            </p>
          )}

          {team.competedAt !== null && (
            <p className="text-mauve-300">
              Frozen at judging on{" "}
              <time dateTime={team.competedAt.toISOString()}>
                {formatEventDateTime(team.competedAt)}
              </time>
              . Everybody on the roster at that moment competed, and closing the
              pull request afterwards does not take that away.
            </p>
          )}
        </div>

        <p className="text-sm text-mauve-400">
          {/* Null is "not graded yet", not zero. Officers fill this in after the
              fact, so an unscored team must not read as one that met nothing —
              which is also why only the counted branch gets a badge. */}
          {team.requirementsMet === null ? (
            "Requirements have not been graded yet."
          ) : (
            <>
              <Badge
                variant="success"
                className="mr-1.5 align-middle tabular-nums"
              >
                {team.requirementsMet}
              </Badge>
              requirements met.
            </>
          )}
        </p>
      </ConsoleCard.Content>
    </ConsoleCard.Root>
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
      <Callout tone="info">
        You are already on a team for this competition — it is one per member —
        so this one is not open to you.{" "}
        <Link
          href={`/competitions/${slug}/teams/${mine.teamSlug}`}
          className="underline"
        >
          Open your team
        </Link>
        .
      </Callout>
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
      <dt className="text-xs tracking-wide text-mauve-500 uppercase">
        {label}
      </dt>
      <dd className="text-2xl font-bold text-white tabular-nums">
        {value}
        <span className="ml-1 text-xs font-normal text-mauve-400">
          {children}
        </span>
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
