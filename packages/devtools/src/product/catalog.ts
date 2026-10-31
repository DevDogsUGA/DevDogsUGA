/**
 * The command tree devtools shows inside a product repository (one with a
 * `devtools.config.json`): declaration only, nothing here runs. The handlers
 * are in `commands.ts`.
 *
 * Smaller than the platform's tree on purpose. A product has no tiers, no env
 * registry and no workspace of Workers, so everything about those is absent
 * rather than present and refusing.
 */
import {
  createCatalog,
  type CommandNode,
  type CommandOption,
} from "@devdogsuga/cli-core/catalog";
import { completionsCommand } from "../completions/catalog.js";
import { docsCommand } from "../docs/catalog.js";
import { moderationCommand } from "../moderation/catalog.js";
import { oauthCommand } from "../oauth/catalog.js";

const TARGET_OPTIONS: readonly CommandOption[] = [
  {
    flag: "--local",
    summary: "Use the Docker stack on this machine.",
  },
  {
    flag: "--hosted",
    summary: "Use your own hosted project (from .env.tooling).",
  },
];

export const productSetupCommand: CommandNode = {
  name: "setup",
  title: "Set up this checkout",
  summary:
    "Your own database (Docker or a hosted project), the schema, the types and sign in.",
  hint: "run this first",
  envFree: true,
  options: [
    ...TARGET_OPTIONS,
    {
      flag: "--download-types",
      summary:
        "Fetch the types CI built for your schema instead of generating them.",
    },
    {
      flag: "--skip-oauth",
      summary: 'Leave "Sign in with DevDogs" for later (`devtools oauth`).',
    },
    {
      flag: "--yes",
      summary: "Allow the schema sync to drop things in your database.",
    },
  ],
};

export const productDoctorCommand: CommandNode = {
  name: "doctor",
  title: "Check my setup",
  summary: "Docker, the pinned Supabase CLI, .env, the database and the types.",
  dryRun: "read-only",
  envFree: true,
};

export const productDbCommand: CommandNode = {
  name: "db",
  summary:
    "Keep your development database and generated types in step with supabase/schemas.",
  envFree: true,
  subcommands: [
    {
      name: "sync",
      title: "Apply the schema to my database",
      summary:
        "Compare your database with supabase/schemas: recreate what it is missing, apply schema changes you pulled, warn about extras, and refuse to alter what is defined differently.",
      envFree: true,
      dryRun: "handled",
      options: [
        ...TARGET_OPTIONS,
        {
          flag: "--rebuild",
          summary:
            "Reset the local database and start over from the schema, then register sign in again.",
        },
        {
          flag: "--strict",
          summary:
            "Fail (changing nothing) when the database has things supabase/schemas does not define, instead of warning.",
        },
        {
          flag: "--yes",
          summary: "Allow changes that drop tables or columns.",
        },
      ],
    },
    {
      name: "types",
      title: "Generate the database types",
      summary:
        "Generate (or download) the types for the current schema. Never committed.",
      envFree: true,
      dryRun: "handled",
      options: [
        ...TARGET_OPTIONS,
        {
          flag: "--download",
          summary:
            "Download the types CI built for this exact schema, with no database needed.",
        },
        {
          flag: "--pack",
          value: "<file>",
          summary:
            "Also pack the generated output into a .tgz release asset (CI).",
        },
      ],
    },
    {
      name: "hash",
      summary: "Print the schema hash that names the generated types.",
      surface: "cli-only",
      envFree: true,
      dryRun: "read-only",
    },
  ],
};

export const productDevDataCommand: CommandNode = {
  name: "dev-data",
  title: "Fill my database with sample data",
  summary:
    "Run the product's dev-data SQL for the member who signed in, in one transaction.",
  hint: "after your first sign in",
  envFree: true,
  dryRun: "handled",
  options: [
    ...TARGET_OPTIONS,
    {
      flag: "--member",
      value: "<email|id>",
      summary: "Seed for this user instead of the latest DevDogs sign in.",
    },
  ],
};

export const productSupabaseCommand: CommandNode = {
  name: "supabase",
  summary: "The Supabase CLI at the version this product is pinned to.",
  hint: "start, status, stop, ...",
  surface: "cli-only",
  envFree: true,
  dryRun: "handled",
};

export const productCheckCommand: CommandNode = {
  name: "check",
  summary: "Structural checks over the checkout, for CI.",
  surface: "cli-only",
  envFree: true,
  noEnv: true,
  dryRun: "read-only",
  subcommands: [
    {
      name: "env-example",
      summary: ".env.example holds public values only: it ships in the app.",
      surface: "cli-only",
      envFree: true,
      noEnv: true,
    },
  ],
};

export const productCatalog = createCatalog({
  usage: "devtools",
  commonTasks: [
    ["setup", "Prepare this checkout"],
    ["db sync", "Apply supabase/schemas to your database"],
    ["db types --download", "Get the generated types without a database"],
    ["dev-data", "Fill your database with sample data"],
    ["doctor", "Check the setup"],
  ],
  groups: [
    {
      title: "Get started",
      commands: [productSetupCommand, productDoctorCommand, oauthCommand],
    },
    {
      title: "Database",
      commands: [productDbCommand, productDevDataCommand],
    },
    {
      title: "Report & Block",
      commands: [moderationCommand],
    },
    {
      title: "The real tools",
      commands: [productSupabaseCommand],
    },
    {
      title: "CI",
      commands: [productCheckCommand, docsCommand, completionsCommand],
    },
  ],
});
