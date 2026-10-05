import { browserOnly, type TerminalRoute } from "./define";
import type { TerminalPattern } from "./paths";
import { changelogArchive, changelogIssue } from "./routes/changelog";
import {
  communityDirectory,
  communityProfile,
  competitionArchive,
} from "./routes/community";
import { competitionBrief, competitionResults } from "./routes/competitions";
import { directions, eventDetail, eventsSchedule } from "./routes/events";
import { home } from "./routes/home";
import { docs, help, helpThread, partners } from "./routes/misc";

const SIGNED_IN =
  "This page is for signed-in members. Sign in from a browser to use it.";

/**
 * What the terminal does for every path in `TERMINAL_PATHS`. Typed against
 * `TerminalPattern`, so adding a path without deciding its route is a type
 * error, and so is a route for a path that doesn't exist.
 */
export const TERMINAL_ROUTES = {
  "/": home,
  "/changelog": changelogArchive,
  "/changelog/:version": changelogIssue,
  "/events": eventsSchedule,
  "/events/directions": directions,
  "/events/:slug": eventDetail,
  "/competitions/:slug": competitionBrief,
  "/competitions/:slug/results": competitionResults,
  "/community": communityDirectory,
  "/community/competitions": competitionArchive,
  "/community/:handle": communityProfile,
  "/partners": partners,
  "/docs": docs,
  "/docs/:project": docs,
  "/docs/:project/*": docs,
  "/help": help,
  "/help/:threadId": helpThread,
  "/legal/privacy": browserOnly(
    "The privacy policy is long-form legal text; read it in a browser, where its headings link and its tables lay out.",
  ),
  "/legal/terms": browserOnly(
    "The terms of service are long-form legal text; read them in a browser, where their headings link.",
  ),
  "/account": browserOnly(SIGNED_IN),
  "/attendance": browserOnly(
    "Check-in happens in a browser: scan the code at the meeting, or open the link it gives you.",
  ),
  "/teams": browserOnly(SIGNED_IN),
  "/teams/requests": browserOnly(SIGNED_IN),
  "/teams/:team": browserOnly(SIGNED_IN),
  "/console/*": browserOnly("The console is for officers, in a browser."),
  "/tools/oauth": browserOnly(
    "This is the devtools sign-in flow. Finish it in the browser window the CLI opened.",
  ),
  "/preview/*": browserOnly("Docs previews are for authors, in a browser."),
  "/oauth/consent": browserOnly(
    "Approving an app's access to your account happens in a browser.",
  ),
} as const satisfies Record<TerminalPattern, TerminalRoute>;
