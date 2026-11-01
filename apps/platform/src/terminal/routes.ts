import type { TerminalRoute } from "./define";
import type { TerminalPattern } from "./paths";
import { accountDeletion, consoleApps } from "./routes/account";
import {
  browserNotice,
  brandGraphics,
  consoleBadges,
  consoleData,
  consoleExports,
  consoleImports,
  consoleMeeting,
  consoleMeetings,
  consoleProjects,
  meetingGraphics,
} from "./routes/console";
import { cliApproval, signInProblem } from "./routes/auth";
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
  "/dashboard/profile": browserNotice("Profile"),
  "/dashboard/accounts": browserNotice("Connected accounts"),
  "/dashboard/oauth": browserNotice("OAuth apps"),
  "/dashboard/oauth/new": browserNotice("New OAuth app"),
  "/dashboard/oauth/:clientId": browserNotice("OAuth app"),
  "/dashboard/attendance": browserNotice("Attendance passport"),
  "/dashboard/docs-preview": browserNotice("Docs preview"),
  "/dashboard/docs-preview/:project": browserNotice("Docs preview"),
  "/dashboard/docs-preview/:project/*": browserNotice("Docs preview"),
  "/dashboard/meetings": browserNotice("Meetings"),
  "/dashboard/moderation": browserNotice("Moderation"),
  "/dashboard/moderation/users/:userId": browserNotice("Member standing"),
  "/dashboard/moderation/:reportId": browserNotice("Report review"),
  "/dashboard/audit-log": browserNotice("Audit log"),
  "/dashboard/audit-log/:eventId": browserNotice("Audit event"),
  "/dashboard/permissions": browserNotice("Permissions"),
  "/dashboard/reflections": browserNotice("Reflections"),
  "/dashboard/qr": browserNotice("QR codes"),

  "/": home,
  "/auth/failed": signInProblem,
  "/oauth/connect": cliApproval,
  "/oauth/device": cliApproval,
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
  "/dashboard/deletion": accountDeletion,
  "/dashboard/meetings/:meetingId": consoleMeeting,
  "/dashboard/schedule": consoleMeetings,
  "/dashboard/schedule/:collection/:key": consoleMeetings,
  "/dashboard/badges": consoleBadges,
  "/dashboard/badges/:userId": consoleBadges,
  "/dashboard/reviews": consoleProjects,
  "/dashboard/reviews/:projectId": consoleProjects,
  "/dashboard/projects": projects,
  "/dashboard/projects/:projectId/report": projectReport,
  "/help": help,
  "/help/:threadId": helpThread,
  "/dashboard/data": consoleData,
  "/dashboard/data/exports": consoleExports,
  "/dashboard/data/imports": consoleImports,
  "/dashboard/apps": consoleApps,
  "/dashboard/graphics": brandGraphics,
  "/dashboard/meetings/:meetingId/graphics": meetingGraphics,
  "/dashboard": browserNotice("Dashboard"),
  "/dashboard/*": browserNotice("Dashboard"),
  "/dashboard/meetings/:meetingId/present": browserNotice(
    "Meeting presentation",
  ),
} as const satisfies Record<TerminalPattern, TerminalRoute>;
