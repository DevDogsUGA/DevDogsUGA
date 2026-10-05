import { SITE } from "@devdogsuga/newsletter";
import { partnersPageEnabled } from "~/server/features";
import { getVisibleDocsProjects } from "~/server/docs/queries";
import { getPublishedFaqPost } from "~/server/support/forumIndex";
import type { Block } from "../blocks";
import { gatedBy, NOT_FOUND, page, PUBLIC, terminal } from "../define";

/**
 * The smaller paths: docs (a pointer, never the pages), help, and partners.
 */

/**
 * Every /docs path answers with the project list and a link to the site. The
 * docs lean on things a terminal can't do (tabs that follow your OS, step
 * courses that track progress, interactive embeds, search), so printing a
 * page's markdown would be a worse copy of it, not a terminal version.
 */
export const docs = terminal(PUBLIC, async ({ params, path }) => {
  const projects = await getVisibleDocsProjects();
  const current = params.project;
  const body: Block[] = [
    {
      type: "notice",
      notice: {
        tone: "info",
        title: "The docs live in the browser",
        text: "Docs pages switch content to match your OS, track your progress through courses, and embed things a terminal can't draw.",
        url: `${SITE}${path}`,
      },
    },
    { type: "heading", text: "projects" },
    {
      type: "entries",
      items: projects.map((project) => ({
        label: project.name,
        current: project.slug === current,
        text: [
          project.description,
          `${SITE}/docs/${encodeURIComponent(project.slug)}`,
        ]
          .filter(Boolean)
          .join(" "),
      })),
      empty: "No documentation is published yet.",
    },
  ];
  return page({
    banner: "DOCS",
    accent: "cyan",
    aside: [`${projects.length} projects`],
    command: "docs --list",
    body,
  });
});

/** What `curl devdogsuga.org/help` lists, in reading order. */
const HELP = [
  {
    path: "/",
    description: "The club: mission, projects, the next meetings, the board.",
  },
  { path: "/events", description: "Upcoming and recent meetings." },
  {
    path: "/events/<slug>",
    description: "One meeting: when, where, the agenda.",
  },
  { path: "/events/directions", description: "Where we meet, with map links." },
  { path: "/changelog", description: "Every newsletter issue." },
  {
    path: "/changelog/<version>",
    description: "One issue, e.g. /changelog/3.0.2.",
  },
  { path: "/competitions/<slug>", description: "A competition's brief." },
  {
    path: "/competitions/<slug>/results",
    description: "Who entered, and who won.",
  },
  {
    path: "/docs",
    description: "Documentation projects (read them in a browser).",
  },
  {
    path: "/help/<thread>",
    description: "An answered #tech-support question.",
  },
] as const;

export const help = terminal(PUBLIC, () =>
  page({
    banner: "HELP",
    accent: "violet",
    aside: ["curl devdogsuga.org/…"],
    command: "help",
    body: [
      {
        type: "text",
        text: "Most of devdogsuga.org answers curl with a terminal version of the page. Anything that needs an account or a mouse points you to the browser instead.",
      },
      { type: "heading", text: "paths" },
      { type: "commands", items: [...HELP] },
      { type: "heading", text: "options" },
      {
        type: "fields",
        rows: [
          {
            label: "?format=txt",
            value:
              "Plain text, no colour. For piping, or terminals without truecolor.",
          },
          {
            label: "?format=ansi",
            value:
              "Force the terminal version, whatever your client says it is.",
          },
          {
            label: "-H 'Accept: text/html'",
            value: "Ask for the HTML page instead.",
          },
        ],
      },
    ],
  }),
);

export const helpThread = terminal(PUBLIC, async ({ params }) => {
  const post = await getPublishedFaqPost(params.threadId ?? "");
  if (!post?.answer) return NOT_FOUND;
  return page({
    banner: "HELP",
    accent: "violet",
    aside: ["#tech-support"],
    command: `faq --show ${post.threadId}`,
    body: [
      { type: "lead", text: post.title },
      {
        type: "text",
        text: "An answered question from the DevDogs #tech-support forum.",
        tone: "dim",
      },
      { type: "heading", text: "question" },
      { type: "markdown", source: post.question },
      { type: "heading", text: "answer" },
      { type: "markdown", source: post.answer },
    ],
  });
});

/**
 * Under construction in every environment today, exactly like the page; the
 * gate is the page's, so when it starts rendering something this route's
 * switch is already wired.
 */
export const partners = terminal(
  gatedBy(partnersPageEnabled, { kind: "underConstruction" }),
  () => ({ kind: "underConstruction" }) as const,
);
