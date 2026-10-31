import { SITE } from "@devdogsuga/newsletter";
import { PUBLIC, page, terminal } from "../define";

/**
 * Projects and reports belong to the signed-in member, and a curl request
 * carries no session, so the terminal says what each page is for and where to
 * sign in. It never names a project, a member or a report.
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
          text: "Propose a project, see the ones you are on and read your EL project reports after signing in. Leadership approves proposals and assigns each project an advisor.",
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
    aside: ["project members", "sign in required"],
    command: "projects report",
    body: [
      {
        type: "notice",
        notice: {
          tone: "info",
          title: "Project reports are written in the browser",
          text: "A report covers a date range, the hours you worked, the merged pull requests behind them and a reflection of at least 100 words. It is needed only for EL credit. Sign in to write one.",
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
