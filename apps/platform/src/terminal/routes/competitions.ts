import { formatEventDate } from "~/lib/eventTime";
import { getCompetitionBySlug } from "~/server/loaders/competitions";
import { getEntrants } from "~/server/loaders/teams";
import type { Block, Field } from "../blocks";
import { NOT_FOUND, page, PUBLIC, terminal } from "../define";
import { ACCENT } from "../theme";

/**
 * /competitions/:slug and its results, from the loaders the two pages use.
 * The brief is the authored markdown itself, drawn by the terminal's own
 * markdown renderer.
 */

/** The page's description line, verbatim. */
function standing(competition: {
  kickedOffAt: Date;
  closedAt: Date | null;
}): string {
  return competition.closedAt === null
    ? `Kicked off ${formatEventDate(competition.kickedOffAt)}. Still open.`
    : `Kicked off ${formatEventDate(competition.kickedOffAt)}, closed ${formatEventDate(competition.closedAt)}.`;
}

export const competitionBrief = terminal(PUBLIC, async ({ params }) => {
  const slug = params.slug ?? "";
  const competition = await getCompetitionBySlug(slug);
  if (!competition) return NOT_FOUND;
  const open = competition.closedAt === null;

  const rows: Field[] = [{ label: "status", value: open ? "Open" : "Closed" }];
  if (competition.plannedEndAt !== null) {
    rows.push({
      label: "planned end",
      value: formatEventDate(competition.plannedEndAt),
    });
  }
  rows.push({ label: "github", value: competition.url, link: true });

  const body: Block[] = [
    { type: "lead", text: competition.title },
    { type: "text", text: standing(competition) },
    { type: "fields", rows },
    { type: "heading", text: "brief" },
    competition.brief === null
      ? {
          type: "text",
          text: "No brief was written for this issue.",
          tone: "dim",
        }
      : { type: "markdown", source: competition.brief },
    { type: "heading", text: "results" },
    {
      type: "commands",
      items: [
        {
          path: `/competitions/${encodeURIComponent(slug)}/results`,
          description: "Who entered, and who won.",
        },
      ],
    },
  ];

  return page({
    banner: "COMPETITIONS",
    accent: "amber",
    aside: [open ? "open now" : "closed"],
    status: open ? "open" : "closed",
    command: `competition --show ${slug}`,
    body,
  });
});

export const competitionResults = terminal(PUBLIC, async ({ params }) => {
  const slug = params.slug ?? "";
  const competition = await getCompetitionBySlug(slug);
  if (!competition) return NOT_FOUND;
  const entrants = await getEntrants(slug);
  const winner = entrants.find((entrant) => entrant.won);

  const body: Block[] = [
    { type: "lead", text: `${competition.title} — results` },
    {
      type: "text",
      text: "Scoring happens off-platform. What's recorded here is who entered, and who won.",
    },
  ];
  if (entrants.length === 0) {
    body.push({
      type: "notice",
      notice: {
        tone: "info",
        title: "Nobody has entered yet",
        text: "Teams enter by opening a pull request from their branch, so there is nothing to show here until one does.",
      },
    });
  } else {
    body.push(
      { type: "heading", text: "entrants" },
      {
        type: "text",
        text: winner
          ? `${winner.teamName} won.`
          : "No winner has been recorded yet.",
        tone: "dim",
      },
      {
        type: "entries",
        items: entrants.map((entrant) => ({
          label: entrant.teamName,
          meta: `${entrant.memberCount} ${entrant.memberCount === 1 ? "member" : "members"}`,
          current: entrant.won,
          chip: entrant.won
            ? { label: "Winner", color: ACCENT.emerald }
            : undefined,
          text:
            entrant.entries
              .map(
                (entry) =>
                  `PR #${entry.prNumber}${entry.merged ? " (merged)" : ""} ${entry.url}`,
              )
              .join("  ") || undefined,
        })),
        empty: "",
      },
    );
  }
  body.push({
    type: "commands",
    items: [
      {
        path: `/competitions/${encodeURIComponent(slug)}`,
        description: "The brief.",
      },
    ],
  });

  return page({
    banner: "COMPETITIONS",
    accent: "amber",
    aside: ["results"],
    status: `${entrants.length} ${entrants.length === 1 ? "entrant" : "entrants"}`,
    command: `competition --results ${slug}`,
    body,
  });
});
