import { SITE } from "@devdogsuga/newsletter";
import { PUBLIC, page, terminal } from "../define";

/**
 * The officers' meeting page lists names, check-in methods and survey answers,
 * and a curl request carries no session, so the terminal says only what the
 * page is and where to sign in. It never names a meeting or an attendee.
 */
export const consoleMeeting = terminal(PUBLIC, ({ path }) =>
  page({
    banner: "DEVDOGS",
    accent: "cyan",
    aside: ["officers only", "sign in required"],
    command: "console attendance",
    body: [
      {
        type: "notice",
        notice: {
          tone: "info",
          title: "Meeting attendance lives in the browser",
          text: "Officers with the attendance permission can see who came, add or remove people, and read the survey tally here after signing in.",
          url: `${SITE}${path}`,
        },
      },
    ],
  }),
);

/**
 * The schedule editor holds an officer's private, unpublished edits and opens
 * pull requests in their name, and a curl request carries no session, so the
 * terminal says what the page is and where to sign in. It never lists a
 * meeting edit or a proposal.
 */
export const consoleMeetings = terminal(PUBLIC, ({ path }) =>
  page({
    banner: "DEVDOGS",
    accent: "cyan",
    aside: ["officers only", "sign in required"],
    command: "console meetings",
    body: [
      {
        type: "notice",
        notice: {
          tone: "info",
          title: "The schedule editor lives in the browser",
          text: "Officers can edit meetings, workshops and venues, see the difference from the official config, and open a pull request on GitHub, after signing in. Edits are saved privately until then.",
          url: `${SITE}${path}`,
        },
      },
    ],
  }),
);

/**
 * Awarding a badge names a member and writes a public citation, and a curl
 * request carries no session, so the terminal says what the page is and where
 * to sign in. It never names a member or an award.
 */
export const consoleBadges = terminal(PUBLIC, ({ path }) =>
  page({
    banner: "DEVDOGS",
    accent: "cyan",
    aside: ["officers only", "sign in required"],
    command: "console badges",
    body: [
      {
        type: "notice",
        notice: {
          tone: "info",
          title: "Badge awards live in the browser",
          text: "Officers can award Workshop Host, Guide Author, Mentor and Event Organizer badges with a public citation, and withdraw any badge with a reason, after signing in.",
          url: `${SITE}${path}`,
        },
      },
    ],
  }),
);

/**
 * Project proposals and report reviews name members and quote their writing,
 * and a curl request carries no session, so the terminal says what the page is
 * and where to sign in. It never names a project, a member or a report.
 */
export const consoleProjects = terminal(PUBLIC, ({ path }) =>
  page({
    banner: "DEVDOGS",
    accent: "cyan",
    aside: ["advisors and officers", "sign in required"],
    command: "console projects",
    body: [
      {
        type: "notice",
        notice: {
          tone: "info",
          title: "Project review lives in the browser",
          text: "Officers approve project proposals and assign advisors; advisors and officers review project reports for EL credit, approving them or returning them with a note, after signing in.",
          url: `${SITE}${path}`,
        },
      },
    ],
  }),
);
