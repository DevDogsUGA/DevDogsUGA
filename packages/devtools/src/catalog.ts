/**
 * devtools' command tree, composed from each domain's `catalog.ts`.
 *
 * Every domain declares its own commands next to the handlers that run them
 * (`<domain>/catalog.ts`, inert data); this file is the one place that decides
 * how the root help groups them and the order the wizard lists them in. Paths
 * do not change when a command moves between groups. Importing it runs
 * nothing, so the launcher can read it before the session's environment is
 * entered.
 */
import { createCatalog, type CommandGroup } from "@devdogsuga/cli-core/catalog";
import { completionsCommand } from "./completions/catalog.js";
import { checkCommand } from "./check/catalog.js";
import { doctorCommand } from "./doctor/catalog.js";
import { docsCommand } from "./docs/catalog.js";
import { envCommand } from "./env/catalog.js";
import { jobsCommand } from "./jobs/catalog.js";
import { moderationCommand } from "./moderation/catalog.js";
import { rolesCommand } from "./roles/catalog.js";
import { oauthCommand } from "./oauth/catalog.js";
import {
  drizzleKitCommand,
  psqlCommand,
  supabaseCommand,
  wranglerCommand,
} from "./passthrough/catalog.js";
import {
  applyMigrationsCommand,
  newMigrationCommand,
  pushConfigCommand,
  restartStackCommand,
} from "./preset/catalog.js";
import { scriptCommand } from "./script/catalog.js";
import { setupCommand } from "./setup/catalog.js";

/**
 * The contributor-facing navigation, grouped by the job somebody is doing.
 *
 * The order is the wizard's first screen (cli-only commands drop out of it),
 * so it reads top to bottom as a contributor meets the work: set up, run
 * things, the database, background jobs, then configuration.
 */
export const GROUPS: readonly CommandGroup[] = [
  {
    title: "Workspace",
    commands: [setupCommand, scriptCommand, oauthCommand, doctorCommand],
  },
  {
    title: "Supabase",
    commands: [
      restartStackCommand,
      newMigrationCommand,
      applyMigrationsCommand,
      pushConfigCommand,
    ],
  },
  {
    title: "Background jobs",
    commands: [jobsCommand],
  },
  {
    title: "Configuration & integrations",
    commands: [envCommand, rolesCommand, moderationCommand],
  },
  {
    title: "The real tools",
    commands: [
      supabaseCommand,
      wranglerCommand,
      drizzleKitCommand,
      psqlCommand,
    ],
  },
  {
    title: "CI & CLI utilities",
    commands: [checkCommand, docsCommand, completionsCommand],
  },
];

export const catalog = createCatalog({
  usage: "pnpm devtools",
  commonTasks: [
    ["setup", "Prepare a new checkout"],
    ["supabase start", "Start Supabase on this machine"],
    ["supabase <args>", "Run the Supabase CLI against this session's tier"],
    ["apply-migrations", "Push migrations, then offer types:db"],
    ["jobs run", "Choose and run a background job"],
  ],
  groups: GROUPS,
});
