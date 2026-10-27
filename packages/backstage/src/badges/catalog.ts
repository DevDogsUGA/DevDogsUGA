/**
 * `import badges`'s place in the command tree: declaration only, nothing runs.
 * The handler lives in `commands.ts` beside it.
 *
 * `envFree` like the other member-data imports: production's `DB_URL` comes
 * from the checkout's `.env.production` or Secrets Manager.
 */
import { DRY_RUN, YES, type CommandNode } from "@devdogsuga/cli-core/catalog";

export const badgesImport: CommandNode = {
  name: "badges",
  envFree: true,
  dryRun: "handled",
  summary:
    "Award Workshop completed and First Merge for evidence that predates the badge triggers.",
  hint: "previews, then asks",
  options: [DRY_RUN, YES],
};
