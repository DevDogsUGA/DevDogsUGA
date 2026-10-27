/**
 * `import contributions`'s place in the command tree: declaration only,
 * nothing runs. The handler lives in `commands.ts` beside it.
 *
 * `envFree` like the other member-data imports: production's keys (the
 * database and the GitHub App's id and private key) come from the checkout's
 * `.env.production` or Secrets Manager, so it runs under `pnpm dlx`.
 */
import { DRY_RUN, YES, type CommandNode } from "@devdogsuga/cli-core/catalog";

export const contributionsImport: CommandNode = {
  name: "contributions",
  envFree: true,
  dryRun: "handled",
  summary:
    "Backfill merged pull requests from the organization's repositories through the GitHub App.",
  hint: "previews, then asks",
  options: [
    {
      flag: "--repo",
      value: "<owner/name>",
      summary: "Only this repository, instead of every repository.",
    },
    {
      flag: "--since",
      value: "<date>",
      summary: "Only pull requests merged on or after this day (2026-09-01).",
    },
    DRY_RUN,
    YES,
  ],
};
