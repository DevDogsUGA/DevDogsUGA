import { SITE } from "@devdogsuga/newsletter";
import { PUBLIC, page, terminal } from "../define";

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
