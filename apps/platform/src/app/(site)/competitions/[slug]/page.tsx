import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRightIcon } from "@phosphor-icons/react/ssr";
import Badge from "~/ui/badge";
import { ConsoleCard } from "~/ui/card";
import DocsMarkdown from "~/components/DocsMarkdown";
import PageShell from "~/components/PageShell";
import { formatEventDate } from "~/lib/eventTime";
import { getCompetitionBySlug } from "~/server/loaders/competitions";

/**
 * Read from the database, which changes when an officer edits the
 * competition. A minute keeps edits prompt without a render per visit.
 */
export const revalidate = 60;

/**
 * /competitions/[slug], the competition itself: title, brief, dates and
 * open/closed state, plus a link back to the GitHub issue it mirrors.
 *
 * Entries and the winner are the next step -- see `/competitions/[slug]/results`,
 * which still renders "nobody has entered yet" for every competition until
 * that mirror exists. This page and that one are deliberately separate:
 * this one is what a competition IS, that one is what has happened in it.
 *
 * Public, same as the results page: a competition's brief is exactly what an
 * officer put on the GitHub issue, which is itself either public or readable
 * by anyone the org lets see the Competitions Project, so gating this page
 * behind `expectSession()` would hide nothing a determined reader could not
 * already see on GitHub -- it would only cost a newcomer the ability to read
 * what DevDogs is building before they sign in.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const competition = await getCompetitionBySlug(slug);

  if (!competition) {
    return {
      title: "Competition not found | DevDogs",
      description: "No DevDogs competition matches this link.",
    };
  }

  return {
    title: `${competition.title} | DevDogs`,
    description:
      competition.closedAt === null
        ? `Kicked off ${formatEventDate(competition.kickedOffAt)}. Still open.`
        : `Kicked off ${formatEventDate(competition.kickedOffAt)}, closed ${formatEventDate(competition.closedAt)}.`,
  };
}

export default async function CompetitionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const competition = await getCompetitionBySlug(slug);
  if (!competition) notFound();

  const open = competition.closedAt === null;

  return (
    <PageShell
      accent="amber"
      title={competition.title}
      description={
        open
          ? `Kicked off ${formatEventDate(competition.kickedOffAt)}. Still open.`
          : `Kicked off ${formatEventDate(competition.kickedOffAt)}, closed ${formatEventDate(competition.closedAt!)}.`
      }
    >
      <ConsoleCard.Root id="brief">
        <ConsoleCard.Header title="Brief">
          <div className="flex items-center gap-2">
            <Badge variant={open ? "success" : "default"}>
              {open ? "Open" : "Closed"}
            </Badge>
            {competition.plannedEndAt !== null && (
              <span className="text-xs text-mauve-400">
                Planned end: {formatEventDate(competition.plannedEndAt)}
              </span>
            )}
          </div>
        </ConsoleCard.Header>
        <ConsoleCard.Content>
          {competition.brief === null ? (
            <p className="text-sm text-mauve-400">
              No brief was written for this issue.
            </p>
          ) : (
            <article className="prose prose-invert max-w-none">
              <DocsMarkdown source={competition.brief} />
            </article>
          )}
          <div>
            <Link
              href={competition.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm font-semibold text-white underline decoration-2 underline-offset-2 hover:no-underline"
            >
              View on GitHub <ArrowUpRightIcon />
            </Link>
          </div>
        </ConsoleCard.Content>
      </ConsoleCard.Root>
    </PageShell>
  );
}
