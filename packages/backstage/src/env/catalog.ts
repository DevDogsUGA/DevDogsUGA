/**
 * `env`'s place in the command tree: declaration only, nothing here runs.
 * The handler lives in `commands.ts` beside it.
 */
import {
  JSON_FLAG,
  YES,
  type CommandNode,
  type CommandOption,
} from "@devdogsuga/cli-core/catalog";

const VAULT_TARGET: CommandOption = {
  flag: "--target",
  value: "<t>",
  summary: "preflight, staging or production. Asked for when absent.",
  // No prompt: `pick.ts` already owns this question, and it orders the list
  // least- to most-dangerous so a reflexive Enter cannot select production.
  // Duplicating it here would put production one keystroke closer.
};

const ENV_FILE: CommandOption = {
  flag: "--file",
  value: "<path>",
  summary: "Read and write this file instead of the target's own.",
};

const PRODUCT_REPO: CommandOption = {
  flag: "--repo",
  value: "<product>",
  summary:
    "Work on a product repo instead of DevDogsUGA: dogdays or dogpack. " +
    "Its file sits in the product checkout; Bitwarden uses the tier project " +
    "with <product>/<KEY> keys, and push goes to that repo's GitHub environment.",
};

const PRODUCT_CHECKOUT: CommandOption = {
  flag: "--checkout",
  value: "<dir>",
  summary:
    "With --repo: the product checkout. Found beside this clone when absent.",
};

const ACCESS_TOKEN: CommandOption = {
  flag: "--access-token",
  value: "<token>",
  summary: "Bitwarden Secrets Manager token. Prefer the vault or the env var.",
};

export const envCommand: CommandNode = {
  name: "env",
  summary: "One env file per target, synced to Bitwarden and GitHub.",
  hint: "needs the Secrets Manager token",
  subcommands: [
    {
      name: "pull",
      summary: "Bitwarden → the target's file, in place.",
      options: [
        VAULT_TARGET,
        PRODUCT_REPO,
        PRODUCT_CHECKOUT,
        ENV_FILE,
        YES,
        ACCESS_TOKEN,
      ],
    },
    {
      name: "push",
      summary: "The target's file → Bitwarden and GitHub.",
      options: [
        VAULT_TARGET,
        PRODUCT_REPO,
        PRODUCT_CHECKOUT,
        ENV_FILE,
        YES,
        ACCESS_TOKEN,
      ],
    },
    {
      name: "audit",
      dryRun: "read-only",
      summary:
        "Compare the file, Bitwarden, GitHub and Cloudflare; list orphaned Worker secrets.",
      hint: "reads only, unless --prune",
      options: [
        VAULT_TARGET,
        PRODUCT_REPO,
        PRODUCT_CHECKOUT,
        ENV_FILE,
        YES,
        ACCESS_TOKEN,
        JSON_FLAG,
        {
          flag: "--prune",
          summary:
            "Delete the Worker secrets no app declares. Asks first without --yes.",
        },
      ],
    },
  ],
};
