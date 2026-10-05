import { ISSUES } from "@devdogsuga/newsletter";
import {
  EVENTS_BLURB,
  HERO_BLURB,
  HERO_HEADLINE,
  LEADERSHIP_BLURB,
  MISSION_PARAGRAPHS,
  PROJECTS_BLURB,
} from "~/components/homeCopy";
import { nextMeetings } from "~/components/EventsSection/UpcomingMeetings";
import { PROJECTS, type Project } from "~/config/projects";
import { getCurrentOfficers } from "~/server/loaders/officers";
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

/** The badge fills `config/projects.ts` uses, as terminal colours. */
const BADGE_COLOR: Record<string, string> = {
  "bg-cyan-400": ACCENT.cyan,
  "bg-amber-400": ACCENT.amber,
};

function projectEntry(project: Project): Entry {
  return {
    label: project.title,
    meta: project.tagline,
    chip: {
      label: project.badge.label,
      color: BADGE_COLOR[project.badge.bg] ?? TONE.mute,
    },
    text:
      project.liveUrl?.href ??
      project.githubUrl ??
      (project.contributions === "closed"
        ? "Built by the officer team."
        : undefined),
  };
}

const UPCOMING_COUNT = 3;

export const home = terminal(PUBLIC, async () => {
  const [meetings, officers] = await Promise.all([
    nextMeetings(UPCOMING_COUNT),
    // The leadership section renders without its board rather than failing
    // the page, and so does this.
    getCurrentOfficers().catch(() => []),
  ]);
  const latest = ISSUES.at(-1);

  const body: Block[] = [
    { type: "lead", text: HERO_HEADLINE.join(" ") },
    { type: "text", text: HERO_BLURB },
    { type: "heading", text: "mission", color: ACCENT.rose },
    ...MISSION_PARAGRAPHS.map((text): Block => ({ type: "text", text })),
    { type: "heading", text: "projects", color: ACCENT.amber },
    { type: "text", text: PROJECTS_BLURB },
    { type: "entries", items: PROJECTS.map(projectEntry), empty: "" },
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
