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
