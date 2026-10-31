import { SITE } from "@devdogsuga/newsletter";
import { PUBLIC, page, terminal } from "../define";

/**
 * Projects, their reports and the review queue belong to signed-in members, and
 * a curl request carries no session, so the terminal says what each page is
 * for and where to sign in. It never names a project, a member or a report.
 */
export const projects = terminal(PUBLIC, ({ path }) =>
  page({
    banner: "DEVDOGS",
    accent: "cyan",
    aside: ["members", "sign in required"],
    command: "projects",
    body: [
      {
        type: "notice",
        notice: {
          tone: "info",
          title: "Projects live in the browser",
          text: "Create a project from a GitHub repo, see the ones you own or contribute to and read your EL project reports after signing in.",
          url: `${SITE}${path}`,
        },
      },
    ],
  }),
);

export const projectDetail = terminal(PUBLIC, ({ path }) =>
  page({
    banner: "DEVDOGS",
    accent: "cyan",
    aside: ["members", "sign in required"],
    command: "projects show",
    body: [
      {
        type: "notice",
        notice: {
          tone: "info",
          title: "A project's page needs the browser",
          text: "Its repos, owners and submissions, and the controls for owners, contributors and officers, are shown after signing in.",
          url: `${SITE}${path}`,
        },
      },
    ],
  }),
);

export const projectReport = terminal(PUBLIC, ({ path }) =>
  page({
    banner: "DEVDOGS",
    accent: "cyan",
    aside: ["project contributors", "sign in required"],
    command: "projects report",
    body: [
      {
        type: "notice",
        notice: {
          tone: "info",
          title: "Project reports are written in the browser",
          text: "A report covers a date range, the hours you worked, the commits behind them and a reflection of at least 100 words. It is needed only for EL credit. Sign in to write one.",
          url: `${SITE}${path}`,
        },
      },
    ],
  }),
);

export const projectReviews = terminal(PUBLIC, ({ path }) =>
  page({
    banner: "DEVDOGS",
    accent: "cyan",
    aside: ["report reviewers", "sign in required"],
    command: "reviews",
    body: [
      {
        type: "notice",
        notice: {
          tone: "info",
          title: "Report review lives in the browser",
          text: "Members with the report-review permission read EL project reports with their cited commits, then approve them or return them with a note, after signing in. A project's advisor reviews its reports from the project page.",
          url: `${SITE}${path}`,
        },
      },
    ],
  }),
);

/**
 * The hackathon list is for signed-in members, and a curl request carries no
 * session, so the terminal says what the page is for and where to sign in. It
 * never lists a hackathon or a submission.
 */
export const hackathons = terminal(PUBLIC, ({ path }) =>
  page({
    banner: "DEVDOGS",
    accent: "cyan",
    aside: ["members", "sign in required"],
    command: "hackathons",
    body: [
      {
        type: "notice",
        notice: {
          tone: "info",
          title: "Hackathons live in the browser",
          text: "See the online hackathons from Devpost and the ones members have submitted, and submit one for an officer to approve, after signing in.",
          url: `${SITE}${path}`,
        },
      },
    ],
  }),
);
