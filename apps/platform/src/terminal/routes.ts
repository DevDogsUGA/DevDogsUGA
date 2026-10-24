import type { TerminalRoute } from "./define";
import type { TerminalPattern } from "./paths";
import { accountDeletion } from "./routes/account";
import {
  consoleBadges,
  consoleMeeting,
  consoleMeetings,
  consoleProjects,
} from "./routes/console";
import { changelogArchive, changelogIssue } from "./routes/changelog";
import { gdgcArchive, gdgcIssue } from "./routes/gdgc";
import { communityDirectory, communityProfile } from "./routes/community";
import { directions, eventDetail, eventsSchedule } from "./routes/events";
import { home } from "./routes/home";
import { projectReport, projects } from "./routes/projects";
import { docs, help, helpThread, kitGallery } from "./routes/misc";

/**
 * What the terminal does for every path in `TERMINAL_PATHS`. Typed against
 * `TerminalPattern`, so adding a path without deciding its route is a type
 * error, and so is a route for a path that doesn't exist. A page with no entry
 * here gets the generic response; see `cloudflare/terminal.ts`.
 */
export const TERMINAL_ROUTES = {
  "/": home,
  "/changelog": changelogArchive,
  "/changelog/:version": changelogIssue,
  "/newsletters/gdgc": gdgcArchive,
  "/newsletters/gdgc/:version": gdgcIssue,
  "/events": eventsSchedule,
  "/events/directions": directions,
  "/events/:slug": eventDetail,
  "/community": communityDirectory,
  "/community/:handle": communityProfile,
  "/docs": docs,
  "/docs/:project": docs,
  "/docs/:project/*": docs,
  "/preview/kit": kitGallery,
  "/account/deletion": accountDeletion,
  "/console/attendance/:meetingId": consoleMeeting,
  "/console/meetings": consoleMeetings,
  "/console/meetings/:collection/:key": consoleMeetings,
  "/console/badges": consoleBadges,
  "/console/badges/:userId": consoleBadges,
  "/console/projects": consoleProjects,
  "/console/projects/:projectId": consoleProjects,
  "/projects": projects,
  "/projects/:projectId/report": projectReport,
  "/help": help,
  "/help/:threadId": helpThread,
} as const satisfies Record<TerminalPattern, TerminalRoute>;
