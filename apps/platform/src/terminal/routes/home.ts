import { ISSUES } from "@devdogsuga/newsletter";
import { KIND } from "@devdogsuga/sdk/brand";
import {
  EVENTS_BLURB,
  HERO_BLURB,
  HERO_HEADLINE,
  LEADERSHIP_BLURB,
  MISSION_PARAGRAPHS,
  PROJECTS_BLURB,
} from "~/components/homeCopy";
import { nextMeetings } from "~/components/EventsSection/UpcomingMeetings";
import { getCurrentOfficers } from "~/server/loaders/officers";
import {
  getFeaturedProjects,
  type ShowcaseProject,
} from "~/server/projects/showcase";
import type { Block, Entry } from "../blocks";
import { page, PUBLIC, terminal } from "../define";
import { meetingItem } from "../meetings";
import { ACCENT, TONE } from "../theme";

/**
 * `curl devdogsuga.org`: the homepage's sections in the homepage's order and
 * words (`~/components/homeCopy`), with the same live reads: the next three
 * meetings through `nextMeetings`, the board through `getCurrentOfficers`.
 * It ends with the index of everything else a terminal can reach.
 */

/**
 * The Cosmic category hue of a status pill, by what it says. The pills are
 * free text an officer wrote, so a label with no hue here draws muted.
 */
const LABEL_COLOR: Record<string, string> = {
  active: KIND.build[3],
  maintenance: KIND.info[3],
};

function projectEntry(project: ShowcaseProject): Entry {
  return {
    label: project.name,
    meta: project.tagline ?? undefined,
    chip: project.showcaseLabel
      ? {
          label: project.showcaseLabel,
          color: LABEL_COLOR[project.showcaseLabel.toLowerCase()] ?? TONE.mute,
        }
      : undefined,
    text:
      project.liveUrl ??
      project.githubUrls[0] ??
      (project.contributionMode === "closed"
        ? "Built by the officer team."
        : undefined),
  };
}

const UPCOMING_COUNT = 3;

export const home = terminal(PUBLIC, async () => {
  const [meetings, officers, projects] = await Promise.all([
    nextMeetings(UPCOMING_COUNT),
    // The leadership section renders without its board rather than failing
    // the page, and so does this. The project list is the same.
    getCurrentOfficers().catch(() => []),
    getFeaturedProjects().catch((): ShowcaseProject[] => []),
  ]);
  const latest = ISSUES.at(-1);

  const body: Block[] = [
    { type: "lead", text: HERO_HEADLINE.join(" ") },
    { type: "text", text: HERO_BLURB },
    { type: "heading", text: "mission", color: ACCENT.rose },
    ...MISSION_PARAGRAPHS.map((text): Block => ({ type: "text", text })),
    { type: "heading", text: "projects", color: ACCENT.amber },
    { type: "text", text: PROJECTS_BLURB },
    { type: "entries", items: projects.map(projectEntry), empty: "" },
    { type: "heading", text: "events", color: ACCENT.cyan },
    { type: "text", text: EVENTS_BLURB },
    {
      type: "events",
      items: meetings.map(meetingItem),
      empty:
        "Nothing on the schedule yet. Check back soon, or watch the Discord.",
    },
  ];

  if (officers.length > 0) {
    body.push(
      { type: "heading", text: "leadership", color: ACCENT.violet },
      { type: "text", text: LEADERSHIP_BLURB },
      {
        type: "fields",
        rows: officers.map((officer) => ({
          label: officer.name,
          value: officer.titles.join(", "),
        })),
      },
    );
  }

  if (latest) {
    body.push(
      { type: "heading", text: "changelog", color: ACCENT.emerald },
      {
        type: "entries",
        items: [
          {
            label: `v${latest.version}`,
            meta: latest.sendLabel,
            current: true,
            headline: latest.tagline,
            text: latest.preview,
            path: `/changelog/${latest.version}`,
          },
        ],
        empty: "",
      },
    );
  }

  body.push(
    { type: "heading", text: "explore", color: TONE.ink },
    {
      type: "commands",
      items: [
        { path: "/events", description: "The schedule." },
        { path: "/changelog", description: "Every newsletter issue." },
        { path: "/docs", description: "Documentation projects." },
        { path: "/help", description: "Everything else curl can reach." },
      ],
    },
  );

  return page({
    banner: "DEVDOGS",
    accent: "rose",
    aside: ["SWE @ UGA", "Learn by doing."],
    command: "whoami",
    body,
  });
});
