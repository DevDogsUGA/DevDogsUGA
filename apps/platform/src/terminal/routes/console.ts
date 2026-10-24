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
