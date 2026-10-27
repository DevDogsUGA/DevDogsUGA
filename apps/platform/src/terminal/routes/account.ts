import { SITE } from "@devdogsuga/newsletter";
import { PUBLIC, page, terminal } from "../define";

/**
 * The scheduled-deletion page needs the signed-in member to say anything, and
 * a curl request carries no session, so the terminal only says where it is and
 * what it is for.
 */
export const accountDeletion = terminal(PUBLIC, ({ path }) =>
  page({
    banner: "DEVDOGS",
    accent: "cyan",
    aside: ["sign in required"],
    command: "account --deletion",
    body: [
      {
        type: "notice",
        notice: {
          tone: "info",
          title: "Account deletion lives in the browser",
          text: "If your account is scheduled for deletion, sign in here to see the date and keep your account.",
          url: `${SITE}${path}`,
        },
      },
    ],
  }),
);

/**
 * Console → Apps needs a signed-in member who holds `canManageOAuthApps`, and a
 * curl request carries no session, so the terminal only says where it is. It
 * never says whether the page exists for anyone: signed-in members without the
 * permission get a 404 in the browser, and this answer is the same for all.
 */
export const consoleApps = terminal(PUBLIC, ({ path }) =>
  page({
    banner: "DEVDOGS",
    accent: "cyan",
    aside: ["sign in required"],
    command: "console --apps",
    body: [
      {
        type: "notice",
        notice: {
          tone: "info",
          title: "Apps are managed in the browser",
          text: "Publishing OAuth apps, returning them to Testing and transferring them to DevDogs happen in the console, for officers who manage OAuth apps.",
          url: `${SITE}${path}`,
        },
      },
    ],
  }),
);
