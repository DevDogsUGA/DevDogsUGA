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

/**
 * Data tools: a CSV upload, a preview and a confirmation, none of which a curl
 * request can do, and every one behind a session. So the terminal names the
 * page and points at the browser, and shows nothing about members or files.
 */
export const consoleData = terminal(PUBLIC, ({ path }) =>
  page({
    banner: "DEVDOGS",
    accent: "cyan",
    aside: ["officers only", "sign in required"],
    command: "console data",
    body: [
      {
        type: "notice",
        notice: {
          tone: "info",
          title: "Data tools live in the browser",
          text: "Officers with the attendance permission import attendance sheets and the Involvement roster here after signing in.",
          url: `${SITE}${path}`,
        },
      },
    ],
  }),
);

export const consoleImports = terminal(PUBLIC, ({ path }) =>
  page({
    banner: "DEVDOGS",
    accent: "cyan",
    aside: ["officers only", "sign in required"],
    command: "console data imports",
    body: [
      {
        type: "notice",
        notice: {
          tone: "info",
          title: "Imports need the browser",
          text: "Uploading a CSV, checking the preview and confirming happen on the page. Use the browser: nothing here reads or changes a record.",
          url: `${SITE}${path}`,
        },
      },
    ],
  }),
);

export const consoleExports = terminal(PUBLIC, ({ path }) =>
  page({
    banner: "DEVDOGS",
    accent: "cyan",
    aside: ["officers only", "sign in required"],
    command: "console data exports",
    body: [
      {
        type: "notice",
        notice: {
          tone: "info",
          title: "Exports need the browser",
          text: "Choosing a dataset and format, checking the counts and downloading happen on the page, and each export is recorded in the audit log. Nothing here reads a record.",
          url: `${SITE}${path}`,
        },
      },
    ],
  }),
);

/**
 * The console's graphics pages are image galleries behind an officer sign-in,
 * and a curl request carries no session, so the terminal only says what the
 * page is, who can open it and where it lives.
 */

export const brandGraphics = terminal(PUBLIC, ({ path }) =>
  page({
    banner: "DEVDOGS",
    accent: "cyan",
    aside: ["officers only"],
    command: "console graphics",
    body: [
      {
        type: "notice",
        notice: {
          tone: "info",
          title: "Brand graphics live in the browser",
          text: "Club logos, banners and app icons to preview and download. Sign in as an officer to open them. From a clone, `pnpm backstage graphics` renders the same files.",
          url: `${SITE}${path}`,
        },
      },
    ],
  }),
);

export const meetingGraphics = terminal(PUBLIC, ({ path }) =>
  page({
    banner: "DEVDOGS",
    accent: "cyan",
    aside: ["officers only"],
    command: "console graphics --meeting",
    body: [
      {
        type: "notice",
        notice: {
          tone: "info",
          title: "Meeting graphics live in the browser",
          text: "Posters and Instagram posts and stories for a meeting and each of its workshops, with downloads and a ZIP. Sign in as an officer to open them.",
          url: `${SITE}${path}`,
        },
      },
    ],
  }),
);
