/**
 * `export`'s place in the command tree: declaration only, nothing here runs.
 * The handler lives in `commands.ts` beside it.
 *
 * `envFree` like `involvement`: production's `DB_URL` comes from the
 * checkout's `.env.production` or Secrets Manager, and the audit identity from
 * `gh`, so it runs under `pnpm dlx`.
 */
import {
  DRY_RUN,
  YES,
  type CommandNode,
  type CommandOption,
} from "@devdogsuga/cli-core/catalog";
import { EXPORTS, type ExportKind } from "@devdogsuga/events/exports";

const FROM: CommandOption = {
  flag: "--from",
  value: "<day>",
  summary: "From this Eastern day (or ISO timestamp), inclusive.",
};

const TO: CommandOption = {
  flag: "--to",
  value: "<day>",
  summary: "Through this Eastern day (or before this ISO timestamp).",
};

const OUT: CommandOption = {
  flag: "--out",
  value: "<path|dir|->",
  summary:
    "Where to write (a folder for several files; - for stdout). Asked at a terminal.",
};

function exportOf(kind: ExportKind, extra: CommandOption[] = []): CommandNode {
  return {
    name: kind,
    envFree: true,
    dryRun: "handled",
    summary: EXPORTS[kind].summary,
    options: [FROM, TO, ...extra, OUT, DRY_RUN, YES],
  };
}

const MEETING: CommandOption = {
  flag: "--meeting",
  value: "<meeting>",
  summary: "One meeting: its day (2026-09-09), slug or id.",
};

export const exportCommand: CommandNode = {
  name: "export",
  summary:
    "Member data as CSV: EL evidence, attendance, reflections, survey responses. Audited.",
  hint: "production database; your gh login is recorded",
  subcommands: [
    exportOf("evidence"),
    exportOf("attendance", [
      MEETING,
      {
        flag: "--format",
        value: "<formats>",
        summary:
          "platform, bevy (GDG attendee import), involvement (MyID emails); comma-separated. Asked at a terminal.",
      },
    ]),
    exportOf("reflections"),
    exportOf("responses", [
      MEETING,
      {
        flag: "--format",
        value: "<formats>",
        summary:
          "platform (one row per answer), wide (one row per person; needs --meeting). Asked at a terminal.",
      },
    ]),
  ],
};
