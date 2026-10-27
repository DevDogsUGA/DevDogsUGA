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
