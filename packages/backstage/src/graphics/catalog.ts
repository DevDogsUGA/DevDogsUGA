/**
 * `graphics`'s place in the command tree: declaration only, nothing here runs.
 * The handler lives in `commands.ts` beside it.
 */
import { type CommandNode } from "@devdogsuga/cli-core/catalog";

export const graphicsCommand: CommandNode = {
  name: "graphics",
  dryRun: "handled",
  envFree: true,
  summary: "Render a club image at one or more sizes.",
  hint: "brand/*, app/*, event/*, or * for all",
  // No subcommands: graphics are positional, and several can be named at
  // once. The command owns its interactive path because it can ask in CLI
  // order (graphic, then format) and derive the second question from the
  // first answer. The outer wizard therefore dispatches bare `graphics`;
  // these options remain here for help and scripted invocations.
  options: [
    {
      flag: "--format",
      value: "<a,b,…>",
      summary:
        "Sizes to render: og, gdgc-wide, gdgc-square, instagram-post, instagram-story, savvycal, email-*, icon-*.",
      // Not prompted here: the command asks itself, from the formats the
      // chosen graphics actually support, which a static list cannot know.
    },
    {
      flag: "--all-formats",
      summary: "Every size the named graphics support.",
    },
    {
      flag: "--out",
      value: "<dir>",
      summary:
        "Write everything into one directory, flat. Defaults to the current directory.",
    },
    {
      flag: "--dry-run",
      summary: "List what would be written, and what each size is for.",
    },
  ],
};
