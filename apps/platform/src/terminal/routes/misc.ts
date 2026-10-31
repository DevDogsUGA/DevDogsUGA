import { SITE } from "@devdogsuga/newsletter";
import { docsHref } from "~/lib/docsSlug";
import { findFolder, indexPageOf } from "~/lib/docsTree";
import {
  getPublishedProject,
  getPublishedSearchEntries,
} from "~/server/docs/published";
import {
  publishedTree,
  type PublishedProject,
} from "~/server/docs/published/view";
import { getContributeMenu, getDocsMenu } from "~/server/docs/menu";
import { getVisibleDocsProjects } from "~/server/docs/queries";
import { getPublishedFaqPost } from "~/server/support/forumIndex";
import type { Block } from "../blocks";
import { kitGalleryEnabled } from "~/server/features";
import {
  gatedBy,
  NOT_FOUND,
  page,
  PUBLIC,
  terminal,
  type RouteResult,
} from "../define";

/**
 * The smaller paths: docs (a pointer, never the pages) and help.
 */

/**
 * Every /docs path answers with the two docs menus (Docs, then Contribute) and
 * a link to the site. The
 * docs lean on things a terminal can't do (tabs that follow your OS, step
 * courses that track progress, interactive embeds, search), so printing a
 * page's markdown would be a worse copy of it, not a terminal version.
 */
export const docs = terminal(PUBLIC, async ({ params, path }) => {
  const projects = await getVisibleDocsProjects();
  const current = params.project;
  if (current && !projects.some((p) => p.slug === current)) {
    const published = await getPublishedProject(current);
    if (published) return publishedDocs(published, path);
  }
  const [docsMenu, contribute] = await Promise.all([
    getDocsMenu(),
    getContributeMenu(),
  ]);
  const row = (entry: (typeof docsMenu)[number]) => ({
    label: entry.name,
    current: entry.project !== null && entry.project === current,
    text: [entry.description, `${SITE}${entry.href}`].filter(Boolean).join(" "),
  });
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
    { type: "heading", text: "docs" },
    {
      type: "entries",
      items: docsMenu.map(row),
      empty: "No documentation is published yet.",
    },
    { type: "heading", text: "contribute" },
    {
      type: "entries",
      items: contribute.map(row),
      empty: "No project has published docs yet.",
    },
  ];
  return page({
    banner: "DOCS",
    accent: "cyan",
    aside: [`${docsMenu.length} docs`, `${contribute.length} projects`],
    command: "docs --list",
    body,
  });
});

/** The longest excerpt of a published page the terminal prints before pointing at the browser. */
const EXCERPT_CHARS = 1800;

/**
 * A project published through the docs pipeline. Unlike the club's own docs
 * (a pointer only), these are plain pages from a project's repository: the
 * terminal lists the project's pages, and for a page prints its title, its
 * description and the start of its text, with the browser URL for the rest.
 * The text is the page's `search.json` plain text, so no markup is involved.
 */
async function publishedDocs(
  project: PublishedProject,
  path: string,
): Promise<RouteResult> {
  const rest = path
    .split(/[?#]/)[0]!
    .replace(/\/+$/, "")
    .split("/")
    .slice(3)
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    });
  const joined = rest.join("/");
  const url = `${SITE}${docsHref(project.slug, rest)}`;
  const tree = publishedTree(project);

  const found = joined ? project.pages.get(joined) : undefined;
  if (found) {
    const entries = await getPublishedSearchEntries(project.pointer);
    const text = entries.find(
      (entry) => entry.path === `${project.slug}/${joined}`,
    )?.plainText;
    const excerpt = (text ?? "").replace(/\s+/g, " ").trim();
    const body: Block[] = [{ type: "heading", text: found.title }];
    if (found.description) body.push({ type: "lead", text: found.description });
    if (excerpt) {
      body.push({
        type: "text",
        text:
          excerpt.length > EXCERPT_CHARS
            ? `${excerpt.slice(0, EXCERPT_CHARS).trimEnd()} …`
            : excerpt,
      });
    }
    body.push({
      type: "notice",
      notice: {
        tone: "info",
        title: "Read the whole page in the browser",
        text: "Formatting, code blocks and images are left out here.",
        url,
      },
    });
    return page({
      banner: "DOCS",
      accent: "cyan",
      aside: [project.name, found.title],
      command: `docs ${project.slug} ${joined}`,
      body,
    });
  }

  const folder = joined ? findFolder(tree, joined) : null;
  if (joined && !folder) return NOT_FOUND;
  const index = folder ? indexPageOf(folder) : null;
  if (index) {
    return publishedDocs(project, `/docs/${project.slug}/${index.path}`);
  }

  const nodes = folder ? folder.children : tree;
  const body: Block[] = [];
  if (project.description && !folder) {
    body.push({ type: "lead", text: project.description });
  }
  body.push(
    { type: "heading", text: "pages" },
    {
      type: "entries",
      items: nodes.map((node) => {
        const description =
          node.type === "page"
            ? project.pages.get(node.path)?.description
            : null;
        return {
          label: node.type === "folder" ? node.name : node.title,
          ...(description ? { text: description } : {}),
          path: docsHref(project.slug, node.path.split("/")),
        };
      }),
      empty: "This project has no pages yet.",
    },
  );
  return page({
    banner: "DOCS",
    accent: "cyan",
    aside: [project.name, `${project.pages.size} pages`],
    command: `docs ${project.slug}${joined ? ` ${joined}` : ""} --list`,
    body,
  });
}

/**
 * The kit gallery is a visual page (every Cosmic class rendered side by side),
 * so the terminal only says where it is. Development only, like the page.
 */
export const kitGallery = terminal(
  gatedBy(kitGalleryEnabled, { kind: "notFound" }),
  ({ path }) =>
    page({
      banner: "DEVDOGS",
      accent: "cyan",
      aside: ["development only"],
      command: "kit --gallery",
      body: [
        {
          type: "notice",
          notice: {
            tone: "info",
            title: "The kit gallery is visual",
            text: "Every Cosmic component, the animated scene and the cursor glow, rendered for screenshots.",
            url: `${SITE}${path}`,
          },
        },
      ],
    }),
);

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
  { path: "/newsletters/gdgc", description: "Every GDGC newsletter issue." },
  {
    path: "/newsletters/gdgc/<issue>",
    description: "One GDGC issue, e.g. /newsletters/gdgc/1.",
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
        text: "Most of devdogsuga.org answers curl with a terminal version of the page. Pages without one answer with their title and a link to open in the browser.",
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
