import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "~/ui/avatar";
import { profilePath } from "~/lib/profilePath";
import type {
  ArchivedCompetition,
  ArchiveContributor,
} from "~/server/loaders/competitionArchive";

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** "Jack Harrington" -> "JH"; "@ada" -> "A". */
function initials(name: string) {
  return (
    name
      .replace(/^@/, "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]!.toUpperCase())
      .join("") || "?"
  );
}

/** Kickoff, then the real close if there is one, else the planned end. */
function dateRange(c: ArchivedCompetition): string {
  const start = dateFormat.format(c.kickedOffAt);
  if (c.closedAt) return `${start} to ${dateFormat.format(c.closedAt)}`;
  if (c.plannedEndAt) {
    return `${start}, planned end ${dateFormat.format(c.plannedEndAt)}`;
  }
  return `Started ${start}`;
}

function ContributorAvatar({
  contributor,
}: {
  contributor: ArchiveContributor;
}) {
  const name = contributor.displayName ?? `@${contributor.handle}`;
  return (
    <Link
      href={profilePath(contributor.handle)}
      aria-label={name}
      title={name}
      className="focus-visible:ring-ring rounded-full outline-none focus-visible:ring-2"
    >
      <Avatar className="size-9">
        {/* A missing object 404s and Radix falls back to the monogram. */}
        {contributor.avatarUrl && (
          <AvatarImage src={contributor.avatarUrl} alt="" />
        )}
        <AvatarFallback className="font-display text-xs font-extrabold">
          {initials(name)}
        </AvatarFallback>
      </Avatar>
    </Link>
  );
}

function Contributors({ c }: { c: ArchivedCompetition }) {
  const hidden = c.privateContributorCount;
  if (c.contributors.length === 0 && hidden === 0) {
    return (
      <p className="text-muted-foreground text-sm">No contributors yet.</p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {c.contributors.map((contributor) => (
        <ContributorAvatar key={contributor.handle} contributor={contributor} />
      ))}
      {hidden > 0 && (
        <span className="text-muted-foreground text-sm">
          {c.contributors.length > 0 ? "+" : ""}
          {hidden} {c.contributors.length > 0 ? "" : "private "}
          {hidden === 1 ? "contributor" : "contributors"}
        </span>
      )}
    </div>
  );
}

/**
 * The past and present competitions, newest first. Each card links to the
 * results page and shows its contributors: members with a public profile as
 * avatars that link to it, everyone else as one count (the loader never hands
 * this component anything about them).
 */
export default function CompetitionArchive({
  competitions,
}: {
  competitions: ArchivedCompetition[];
}) {
  if (competitions.length === 0) {
    return (
      <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
        No competitions yet. They will be listed here once the first one kicks
        off.
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-4">
      {competitions.map((c) => (
        <li
          key={c.slug}
          className="bg-card text-card-foreground flex flex-col gap-3 rounded-xl border p-5"
        >
          <div>
            <h2 className="font-display text-xl font-extrabold">{c.title}</h2>
            <p className="text-muted-foreground text-sm">{dateRange(c)}</p>
          </div>
          {c.briefExcerpt && <p className="text-sm">{c.briefExcerpt}</p>}
          <p className="text-sm">
            {c.winner ? (
              <>
                <span className="font-semibold">Winner:</span>{" "}
                {c.winner.teamName}
              </>
            ) : (
              <span className="text-muted-foreground">
                No winner recorded yet.
              </span>
            )}
          </p>
          <Contributors c={c} />
          <Link
            href={`/competitions/${encodeURIComponent(c.slug)}/results`}
            className="w-fit text-sm font-semibold underline underline-offset-2"
          >
            View results
          </Link>
        </li>
      ))}
    </ol>
  );
}
