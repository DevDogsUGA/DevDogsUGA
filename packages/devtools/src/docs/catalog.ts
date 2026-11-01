/**
 * `docs`'s place in the command tree: declaration only, nothing here runs. The
 * handler lives in `commands.ts` beside it.
 *
 * `cli-only`, `envFree` and `noEnv`, like `check`: it reads a folder, never an
 * env file or a database, and needs no tier.
 */
import { type CommandNode } from "@devdogsuga/cli-core/catalog";

export const docsCommand: CommandNode = {
  name: "docs",
  dryRun: "read-only",
  summary: "Checks on a project's docs/ folder.",
  hint: "check [<folder>]",
  surface: "cli-only",
  subcommands: [
    {
      name: "check",
      summary: "Is this docs/ folder ready to publish?",
      hint: "[<folder>]",
      surface: "cli-only",
      envFree: true,
      noEnv: true,
    },
  ],
};
