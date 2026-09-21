/**
 * The command tree, as data.
 *
 * One declaration, three readers:
 *
 *   * `help.ts` renders it, one level at a time.
 *   * `menu.ts` walks its interactive commands and options without a second
 *     list to keep in step.
 *   * contributor documentation uses the same group and command vocabulary.
 *
 * It is deliberately inert: names, summaries and option shapes, no imports of
 * anything that runs. `cli.ts` owns dispatch; the wizard turns a walk of this
 * tree into an argv and hands it to that same dispatcher, which keeps menu and
 * CLI behavior aligned by construction rather than by review.
 *
 * One exception: `WORKER_APP_CHOICES` imports the shared `WORKER_APPS` list
 * (root `workers.json`) so `cf preview`/`typegen`/`build`'s `--app` choices
 * cannot drift from the six-site source of truth. It is data — a string
 * array read from a JSON file — not a function this file calls.
 *
 * ## What a summary is for
 *
 * Every `summary` is one line and is the ONLY thing `--help` prints for a
 * command at the level above it. Rationale, target tables, credential lookup
 * order and deploy internals live in `docs/`, not here: `--help` is a map, and
 * a map that reprints the territory is the thing this replaced.
 */
import { WORKER_APPS } from "./workers.js";

/**
 * One choice in a select prompt.
 *
 * `value` is the value the wizard passes for the option's own flag — e.g.
 * `local`/`remote` for `--target`. The menu always emits `[flag, value]`.
 */
export interface OptionChoice {
  value: string;
  label?: string;
  hint?: string;
}

/** The `--app <slug>` choices shared by `cf preview`/`typegen`/`build`. */
const WORKER_APP_CHOICES: OptionChoice[] = WORKER_APPS.map((app) => ({
  value: app,
  label: app,
}));

/**
 * A prompt the wizard raises to fill an option the command line would carry.
 *
 * `confirm` has no polarity switch on purpose: **yes adds the flag**, always.
 * So every message here is phrased so yes is the flag's own meaning ("Skip the
 * duplicate scan?" rather than "Scan for duplicates?"). That leaves the wizard
 * without a second place to get an inversion wrong.
 */
export type OptionPrompt =
  | { kind: "confirm"; message: string; initial: boolean }
  | { kind: "select"; message: string; choices: readonly OptionChoice[] }
  | { kind: "text"; message: string; placeholder?: string; optional?: boolean };

export interface CommandOption {
  /** `--target`. */
  flag: string;
  /** `<t>` for a flag that takes a value; absent for a boolean. */
  value?: string;
  /** One line. Printed by `devtools <command> --help`. */
  summary: string;
  /**
   * How the wizard asks for it.
   *
   * Absent means the wizard does not ask HERE, a decision rather than an
   * omission. Three kinds of option are deliberately promptless:
   *
   *   * ones the command asks for ITSELF, from something live. `--app` picks
   *     from the apps in the database, `--user` from the accounts on it,
   *     `--target` from `pick.ts`'s danger-ordered list, `--apps` from the env
   *     registry. A wizard text box would be a worse version of a menu that
   *     already exists, and `--target`'s would put production one keystroke
   *     closer than `pick.ts` deliberately puts it;
   *   * ones that exist to SUPPRESS a prompt (`--yes`), meaningless in a
   *     wizard, which is the prompt;
   *   * ones that carry a credential (`--access-token`). The interactive path
   *     resolves it better, and typing it makes it visible to `ps` and shell
   *     history.
   *
   * So every option is reachable from the menu; what varies is which screen
   * asks. `commands.test.ts` pins the promptless set so a fourth case has to be
   * argued for rather than accumulate.
   */
  prompt?: OptionPrompt;
}

/**
 * Something about the machine that a command cares about.
 *
 * A string rather than a predicate, so this file stays what its header says it
 * is: data. `environment.ts` is the only module that knows what these mean,
 * `menu.ts` acts on them, and the docs build can render "shown when the local
 * stack is running" without being able to run anything.
 */
export type Condition = "docker" | "instance-running" | "instance-stopped";

/**
 * Which layer of the database group a command acts on.
 *
 * Groups like Supabase and (future) `db` span multiple layers: the local
 * Docker stack, the Postgres database inside it, and hosted endpoints. Scopes
 * let `--help` head each run and the wizard put the layer on every line,
 * so a contributor chooses deliberately rather than by accident.
 *
 *   `machine`  — acts on this machine's containers (`link`, `stop`, `restart`)
 *   `repo`     — reads or writes repository files only (no live connection)
 *   `endpoint` — connects to the SESSION's database (picked once at launch,
 *                `--tier development:local|development:remote|staging|production`)
 *   `infra`    — infrastructure-level; touches roles, credentials, or config
 */
export type Scope = "machine" | "repo" | "endpoint" | "infra";

/**
 * How each scope reads, in the two places that draw it.
 *
 * `menu` sits inline in a hint, so it is one word. `help` heads a block of
 * commands, so it can be a phrase. Both live here rather than in the renderers
 * because they are labels, the same kind of data as a group title.
 */
export const SCOPES: Record<Scope, { menu: string; help: string }> = {
  machine: { menu: "This machine", help: "Supabase on this machine" },
  repo: { menu: "Repo", help: "files in the repo" },
  endpoint: { menu: "Database", help: "the session's database (--tier)" },
  infra: {
    menu: "Hosted",
    help: "hosted infrastructure, each naming its own connection",
  },
};

export interface CommandNode {
  name: string;
  /** One line. See the header. */
  summary: string;
  /** Sits beside the name in the wizard; shorter than the summary. */
  hint?: string;
  options?: readonly CommandOption[];
  subcommands?: readonly CommandNode[];
  /**
   * Offer this in the wizard only while the condition holds.
   *
   * For commands that are *meaningless* otherwise, not merely inconvenient:
   * stopping a stack that is already stopped is the whole of the category. A
   * command that would run and fail with a good message gets `needs` instead.
   * See the two-line rule on `isOffered` in `environment.ts` for why hiding is
   * the rarer of the two.
   *
   * Wizard-only. `--help`, the dispatcher and the generated reference all
   * ignore this, so nothing here removes a command from the CLI.
   */
  when?: Condition;
  /**
   * Offer this always, but say on the line why it will not work right now.
   *
   * The four moderation commands carry it: each one opens a client against
   * Supabase on this machine and has no remote path at all, so with it down
   * they are a spinner followed by a connection error. The hint turns that
   * into a sentence the reader sees before choosing.
   */
  needs?: Condition;
  /**
   * Which layer this acts on, for a group that spans several. See `Scope`.
   *
   * Groups like Supabase span the stack on this machine and the database
   * inside it.
   * `--help` heads a block with it; the wizard puts it on the line.
   */
  scope?: Scope;
  /**
   * Where this command may be reached.
   *
   * Most commands are interactive and therefore appear in both the menu and
   * `--help`. `cli-only` commands still appear in help and completions, but do
   * not get a GUI entry: their output is meant to be consumed by a shell.
   */
  surface?: "interactive" | "cli-only";
}

/** Top-level sections. Only `--help` and the wizard's first screen use these. */
export interface CommandGroup {
  title: string;
  commands: readonly CommandNode[];
}

// ── Exit codes ───────────────────────────────────────────────────────────────

/** Standard success. */
export const EXIT_OK = 0;
/** Command failed. */
export const EXIT_FAIL = 1;
/** `--check` found drift. Distinct from failure so scripts can tell them apart. */
export const EXIT_DRIFT = 2;

// ── Shared option shapes ─────────────────────────────────────────────────────

/**
 * `docs index`'s delete acknowledgment — NOT a database selector.
 *
 * The db namespace's old `--target local|remote` flag is retired outright
 * (the SESSION names the database now — see `db/connection.ts`), but `docs
 * index` keeps this spelling for a different job: its prune deletes rows,
 * and running that against a non-local `DB_URL` requires saying so out
 * loud. The database itself still comes from the session's env.
 */
export const DOCS_TARGET: CommandOption = {
  flag: "--target",
  value: "<local|remote>",
  summary: "Acknowledge indexing a non-local DB_URL. Defaults to local-only.",
  prompt: {
    kind: "select",
    message: "May this prune a non-local database?",
    choices: [
      { value: "local", label: "Local only", hint: "the default" },
      { value: "remote", label: "Yes — the session's remote DB_URL" },
    ],
  },
};

/**
 * The deployment-tier selector, for the commands that resolve a tier of
 * their OWN (cron/workflows run against a chosen tier's env). The session's
 * global `--tier` — `development:local|development:remote|staging|production`,
 * stripped by the launcher before dispatch — is a superset of this
 * vocabulary; this per-command flag still reads plain tiers.
 */
export const TIER: CommandOption = {
  flag: "--tier",
  value: "<t>",
  summary: "Which deployment tier. Asked for when absent.",
};

/** Print what would change; write nothing; exit 0. On every command that writes. */
export const DRY_RUN: CommandOption = {
  flag: "--dry-run",
  summary: "Print what would change, write nothing, exit 0.",
};

/** Verify correctness; write nothing; exit 2 on drift. */
export const CHECK: CommandOption = {
  flag: "--check",
  summary: "Verify, write nothing, exit 2 on drift.",
};

/**
 * Machine-readable output to stdout.
 *
 * Promptless by design: the wizard is already interactive; a flag that switches
 * its output format has no meaning there. `commands.test.ts` pins the promptless
 * set with a "scripting-only" category for exactly this kind of flag.
 */
export const JSON_FLAG: CommandOption = {
  flag: "--json",
  summary: "Print machine-readable JSON to stdout.",
};

const VAULT_TARGET: CommandOption = {
  flag: "--target",
  value: "<t>",
  summary: "preflight, staging or production. Asked for when absent.",
  // No prompt: `pick.ts` already owns this question, and it orders the list
  // least- to most-dangerous so a reflexive Enter cannot select production.
  // Duplicating it here would put production one keystroke closer.
};

/**
 * The three flags every `run` task takes.
 *
 * None carries a `prompt`, and that is the point rather than an omission.
 * `run` opens a multiselect of the apps defining the task, so a wizard that
 * asked "every package?", "which filter?" and "which tier?" up front would
 * ask the same question three times and let the answers disagree. `--tier`
 * is promptless for a different reason than `--filter`/`--all`, though: it is
 * not a question `run` asks itself elsewhere (unlike `cron run`'s own
 * `--tier`, which opens a live picker) — it is a scripting input with no
 * wizard equivalent, the same category `--json` sits in. `--help` still
 * documents all three, which is where someone scripting this will look.
 *
 * Same reasoning as `VAULT_TARGET` above: the command owns the question, so the
 * tree declares the flag and stays quiet.
 */
const TURBO_OPTIONS: readonly CommandOption[] = [
  {
    flag: "--filter",
    value: "<pkg>",
    summary: "Limit to a package. Turbo's own flag; skips the question.",
  },
  {
    flag: "--all",
    summary: "Every package, unfiltered, with nothing asked.",
  },
  {
    flag: "--tier",
    value: "<t>",
    summary: "Load a tier's env into the run. CLI-only; never prompted.",
  },
];

const ENV_FILE: CommandOption = {
  flag: "--file",
  value: "<path>",
  summary: "Read and write this file instead of the target's own.",
};

/** Skip every interactive confirmation prompt. On every destructive command. */
export const YES: CommandOption = {
  flag: "--yes",
  summary: "Skip the confirmations.",
};

const ACCESS_TOKEN: CommandOption = {
  flag: "--access-token",
  value: "<token>",
  summary: "Bitwarden Secrets Manager token. Prefer the vault or the env var.",
};

const DB_URL: CommandOption = {
  flag: "--db-url",
  value: "<url>",
  summary: "Privileged connection. Defaults to .env.production's DB_URL.",
  prompt: {
    kind: "text",
    message: "Connection URL? (blank uses .env.production's DB_URL)",
    optional: true,
  },
};

const SIGNING_TARGET: CommandOption = {
  flag: "--target",
  value: "<t>",
  summary: "staging or production. Required — two projects, two secrets.",
  prompt: {
    kind: "select",
    message: "Which environment's signing key?",
    choices: [
      { value: "staging", hint: "the everyday one" },
      { value: "production", hint: "⚠️  the live project" },
    ],
  },
};

// ── The tree ─────────────────────────────────────────────────────────────────

const DECLARED_GROUPS: readonly CommandGroup[] = [
  {
    title: "Start here",
    commands: [
      {
        name: "setup",
        summary: "Check prerequisites and seed .env.",
        hint: "run this first",
      },
      {
        name: "completions",
        summary: "Output a shell completion script for devtools.",
        hint: "pipe to source or write to a file",
        surface: "cli-only",
        options: [
          {
            flag: "--shell",
            value: "<bash|zsh>",
            summary: "Target shell. Asked for when absent.",
            prompt: {
              kind: "select",
              message: "Which shell?",
              choices: [{ value: "bash" }, { value: "zsh" }],
            },
          },
        ],
      },
    ],
  },
  {
    title: "Workspace",
    commands: [
      {
        name: "run",
        summary: "Run a Turborepo task, asking which apps first.",
        hint: "build, dev, lint…",
        // The six with a root alias, which are the six a contributor types.
        // NOT a mirror of `turbo.json`: `run` forwards whatever name it is
        // given, so `docs:gen` and `test:coverage` work without being listed,
        // and turbo's own `deploy` task stays out of a menu where it would sit
        // one line from this CLI's unrelated `deploy` group.
        subcommands: [
          {
            name: "build",
            summary: "Compile every package an app needs.",
            options: TURBO_OPTIONS,
          },
          {
            name: "dev",
            summary: "Start the development servers.",
            options: TURBO_OPTIONS,
          },
          {
            name: "typecheck",
            summary: "Run tsc across the workspace.",
            options: TURBO_OPTIONS,
          },
          {
            name: "lint",
            summary: "Run ESLint across the workspace.",
            options: TURBO_OPTIONS,
          },
          {
            name: "lint:fix",
            summary: "Run ESLint and write what it can fix.",
            options: TURBO_OPTIONS,
          },
          {
            name: "test",
            summary: "Run the unit tests.",
            options: TURBO_OPTIONS,
          },
        ],
      },
    ],
  },
  {
    title: "Brand",
    commands: [
      {
        name: "emails",
        summary: "Render populated transactional email previews.",
        hint: "HTML or plain text, one template or all",
        // Like `images`, this command owns its dependent questions: formats
        // and output only make sense after the templates have been selected.
        options: [
          {
            flag: "--format",
            value: "<html,text>",
            summary: "Outputs to write. Defaults to html.",
          },
          {
            flag: "--out",
            value: "<dir>",
            summary: "Output directory. Defaults to ./email-previews.",
          },
          {
            flag: "--dry-run",
            summary: "List subjects and destination files without writing.",
          },
        ],
      },
      {
        name: "newsletter",
        summary: "Export Changelog issues as Outlook drafts and previews.",
        hint: "a version, several, or * for all",
        options: [
          {
            flag: "--format",
            value: "<eml,html>",
            summary: "Outputs to write. Defaults to both.",
          },
          {
            flag: "--out",
            value: "<dir>",
            summary: "Output directory. Defaults to ./changelog-exports.",
          },
          {
            flag: "--push",
            summary:
              "Append each issue to the club mailbox's Drafts, for review in any Outlook.",
          },
          {
            flag: "--send",
            summary:
              "Send each issue over SMTP, byte-for-byte. Outlook's composers rewrite drafts they send; this path does not.",
          },
          {
            flag: "--to",
            value: "<a,b,…>",
            summary: "Recipients of --send. Required with it.",
          },
          {
            flag: "--mailbox",
            value: "<address>",
            summary:
              "Mailbox --push and --send sign into. Defaults to devdogs@uga.edu.",
          },
        ],
      },
      {
        name: "images",
        summary: "Render a club image at one or more sizes.",
        hint: "brand/*, page/*, app/*, event/*, or * for all",
        // No subcommands: graphics are positional, and several can be named at
        // once. The command owns its interactive path because it can ask in CLI
        // order — graphic, format, output — and derive each question from the
        // previous answer. The outer wizard therefore dispatches bare `images`;
        // these options remain here for help and scripted invocations.
        options: [
          {
            flag: "--format",
            value: "<a,b,…>",
            summary:
              "Sizes to render: og, gdgc-wide, gdgc-square, savvycal, email-*, icon-*.",
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
            summary: "Write everything into one directory, flat.",
          },
          {
            flag: "--default-out",
            summary: "Write each image where it belongs in the repo.",
          },
          {
            flag: "--dry-run",
            summary: "List what would be written, and what each size is for.",
          },
        ],
      },
    ],
  },
  {
    title: "Moderation",
    commands: [
      {
        name: "catalog",
        summary: "List the report reasons and content types in the database.",
        hint: "what can be reported here",
        needs: "instance-running",
        options: [JSON_FLAG],
      },
      {
        name: "doctor",
        summary: "Check an app's moderation integration.",
        hint: "and whether the catalog holds up",
        needs: "instance-running",
        options: [
          {
            flag: "--app",
            value: "<slug>",
            summary: "App to check. Asked for when absent.",
          },
          JSON_FLAG,
        ],
      },
      {
        name: "roundtrip",
        summary: "File a report, quarantine it, and check the freeze.",
        hint: "end to end, then cleans up",
        needs: "instance-running",
      },
      {
        name: "grant-root",
        summary: "Give an account every permission on your own database.",
        needs: "instance-running",
        options: [
          {
            flag: "--user",
            value: "<email>",
            summary: "Account to grant Root to. Asked for when absent.",
          },
        ],
      },
    ],
  },
  {
    title: "Generate",
    commands: [
      {
        name: "gen",
        summary: "Regenerate committed, generated source.",
        hint: "refresh a tracked artifact",
        subcommands: [
          {
            name: "campus-map",
            summary: "Rebuild the FindUs campus map from OpenStreetMap.",
            hint: "occasional — rerun when OSM improves the area",
          },
          {
            name: "hypno",
            summary: "Bake the hero spiral into a pre-blurred raster.",
            hint: "needs Playwright",
          },
          {
            name: "og-assets",
            summary: "Re-embed OG fonts, icons and brand art.",
            hint: "after a brand, font or Phosphor bump",
          },
          {
            name: "email-templates",
            summary: "Recompile the transactional email chunks.",
            hint: "render → tokenize → emit",
          },
        ],
      },
    ],
  },
  {
    title: "Cron",
    commands: [
      {
        name: "cron",
        summary: "Cloudflare cron triggers: list schedules or fire one now.",
        hint: "list schedules, run a job",
        subcommands: [
          {
            name: "list",
            summary:
              "Every registered cron: schedule, English description, routes.",
            hint: "the audit view",
            options: [
              {
                flag: "--app",
                value: "<slug>",
                summary: "Limit to one app. All apps if omitted.",
              },
              {
                flag: "--tier",
                value: "<t>",
                summary:
                  "Whose wrangler schedules to read. All tiers if omitted.",
                prompt: {
                  kind: "select",
                  message: "Which tier's wrangler schedules?",
                  choices: [
                    { value: "development", hint: "the default" },
                    { value: "staging" },
                    { value: "production" },
                  ],
                },
              },
              JSON_FLAG,
            ],
          },
          {
            name: "run",
            summary: "Choose and fire a configured cron schedule now.",
            hint: "pick a job from the Worker configuration",
            options: [
              {
                flag: "--app",
                value: "<slug>",
                summary: "Limit the discovered jobs to one app.",
              },
              {
                flag: "--tier",
                value: "<t>",
                summary:
                  "development, staging or production. Asked when absent.",
              },
              {
                flag: "--cron",
                value: "<expr>",
                summary: "Fire this schedule without opening the picker.",
              },
              YES,
            ],
          },
        ],
      },
      {
        name: "workflows",
        summary:
          "Cloudflare Workflows: list configured bindings or trigger one.",
        hint: "pick a workflow from wrangler.jsonc",
        subcommands: [
          {
            name: "list",
            summary:
              "List every Workflow binding declared by each Wrangler tier.",
            options: [
              {
                flag: "--app",
                value: "<slug>",
                summary: "Limit to one app.",
              },
              {
                flag: "--tier",
                value: "<t>",
                summary: "Limit to development, staging or production.",
              },
              JSON_FLAG,
            ],
          },
          {
            name: "run",
            summary: "Choose and trigger a Workflow through Wrangler.",
            hint: "local session or a deployed tier",
            options: [
              {
                flag: "--app",
                value: "<slug>",
                summary: "Limit the discovered Workflows to one app.",
              },
              {
                flag: "--tier",
                value: "<t>",
                summary:
                  "development, staging or production. Asked when absent.",
              },
              {
                flag: "--workflow",
                value: "<name>",
                summary:
                  "Trigger this configured name without opening the picker.",
              },
              {
                flag: "--params",
                value: "<json>",
                summary: "JSON parameters passed to the Workflow instance.",
              },
              {
                flag: "--port",
                value: "<n>",
                summary: "Local Wrangler session port. Defaults to 8787.",
              },
              YES,
            ],
          },
          {
            name: "serve",
            summary: "Start an app-scoped local Wrangler runtime until Ctrl+C.",
            hint: "secure alternative to bare wrangler dev",
            options: [
              {
                flag: "--app",
                value: "<slug>",
                summary: "Serve the development Workflow for this app.",
              },
              {
                flag: "--port",
                value: "<n>",
                summary: "Local Wrangler session port. Defaults to 8787.",
              },
            ],
          },
        ],
      },
    ],
  },
  {
    title: "Project setup",
    commands: [
      {
        name: "oauth",
        summary: 'Configure "Sign in with DevDogs" for this directory.',
        options: [
          {
            flag: "--base-url",
            value: "<url>",
            summary: "DevDogs API URL. Asked for when absent.",
            prompt: {
              kind: "text",
              message: "DevDogs API URL? (blank asks inside the wizard)",
              optional: true,
            },
          },
        ],
      },
      {
        name: "airtable",
        summary: "The officers' base: check it, or bring it up to date.",
        subcommands: [
          {
            name: "check",
            summary: "Diff the registry against the committed snapshot.",
            hint: "no token, no network — what CI runs",
            options: [JSON_FLAG],
          },
          {
            name: "verify",
            summary: "Diff the live base against the registry.",
            hint: "reads the base — start here",
            options: [
              {
                flag: "--no-duplicates",
                summary: "Skip the duplicate scan, which reads every record.",
                prompt: {
                  kind: "confirm",
                  // Yes adds the flag. Default no: the scan is the slow part,
                  // but it is also the part that finds anything.
                  message: "Skip the duplicate scan, which reads every record?",
                  initial: false,
                },
              },
              JSON_FLAG,
            ],
          },
          {
            name: "apply",
            summary: "Create what the registry declares, then write back.",
            hint: "writes the base AND two committed files",
            options: [
              {
                flag: "--dry-run",
                summary: "Report what it would create, and create nothing.",
                prompt: {
                  kind: "confirm",
                  message:
                    "Dry run — report what it would create, create nothing?",
                  initial: true,
                },
              },
            ],
          },
        ],
      },
      {
        name: "docs",
        summary: "The documentation search index.",
        subcommands: [
          {
            name: "index",
            summary: "Push the built docs artifact into the search index.",
            hint: "prunes stale rows in the target database",
            scope: "endpoint",
            options: [DOCS_TARGET],
          },
        ],
      },
    ],
  },
  {
    title: "Env files",
    commands: [
      {
        name: "env",
        summary: "One env file per target, synced to Bitwarden and GitHub.",
        subcommands: [
          {
            name: "pull",
            summary: "Bitwarden → the target's file, in place.",
            options: [VAULT_TARGET, ENV_FILE, YES, ACCESS_TOKEN],
          },
          {
            name: "push",
            summary: "The target's file → Bitwarden and GitHub.",
            options: [VAULT_TARGET, ENV_FILE, YES, ACCESS_TOKEN],
          },
          {
            name: "audit",
            summary: "Compare the file, Bitwarden, GitHub and Cloudflare.",
            hint: "reads only",
            options: [VAULT_TARGET, ENV_FILE, YES, ACCESS_TOKEN, JSON_FLAG],
          },
          {
            name: "init",
            summary: "Create a target file, or append newly declared keys.",
            hint: "existing lines are never changed",
            options: [
              {
                flag: "--target",
                value: "<t>",
                summary: "Which file to create. Defaults to development.",
                prompt: {
                  kind: "select",
                  message: "Create a file for which target?",
                  choices: [
                    { value: "development", hint: ".env — the default" },
                    { value: "preflight", hint: ".env.preflight" },
                    { value: "staging", hint: ".env.staging" },
                    { value: "production", hint: "⚠️  .env.production" },
                  ],
                },
              },
              {
                flag: "--apps",
                value: "<a,b,…>",
                summary: "Which sections to render. Development only; asks.",
              },
            ],
          },
          {
            name: "example",
            summary: "Regenerate .env.example from the manifests.",
            options: [
              {
                flag: "--check",
                summary: "Verify it is current, as CI does. Writes nothing.",
                prompt: {
                  kind: "confirm",
                  message: "Check only, without rewriting .env.example?",
                  initial: true,
                },
              },
            ],
          },
          {
            name: "reset",
            summary: "Blank every value in .env, keeping each commented out.",
            hint: "local only, no target",
            options: [ENV_FILE, YES],
          },
        ],
      },
      {
        // The Bitwarden CLI, not a command of this one: everything after `bw`
        // is handed to it untouched. It is here because it is the login that
        // `env pull` depends on, it ships as a devtools dependency, and the
        // root `bw` alias it replaces was the last thing at the workspace root
        // reaching into this package. Declaring no subcommands is deliberate:
        // Bitwarden's commands are its own to document, and mirroring a slice
        // of them here would go stale on their release schedule, not ours.
        name: "bw",
        summary: "Run the Bitwarden CLI. `bw login` is the one you want.",
        hint: "passes everything through",
      },
    ],
  },
  {
    title: "Database",
    // One command, `db`. Its OWN subcommands carry the scopes — see the
    // header comment on `Scope` and `db`'s `hint` below. Declared in scope
    // order (machine, repo, endpoint, infra, then the unscoped escape hatch)
    // so `--help` and the wizard render one contiguous block per scope
    // instead of several.
    commands: [
      {
        name: "db",
        summary: "Supabase endpoints, and the databases inside them.",
        hint: "start, migrate, reset, types…",
        subcommands: [
          // ── machine — Supabase on this machine ─────────────────────────
          {
            name: "start",
            summary: "Start Supabase on this machine.",
            hint: "boots the Docker containers",
            scope: "machine",
            when: "instance-stopped",
          },
          {
            name: "connect",
            summary: "Run `supabase link` against a hosted project ref.",
            hint: "for driving the bare supabase CLI by hand",
            scope: "machine",
          },
          {
            name: "stop",
            summary: "Shut it down, freeing its containers.",
            hint: "your data survives",
            scope: "machine",
            // Not offered while nothing is running: "stop" against a stopped
            // stack is the one shape of question a menu should never ask.
            when: "instance-running",
          },
          {
            name: "restart",
            summary: "Stop it, then start it again.",
            // The reason this exists rather than being a footnote on `reset`:
            // `config.toml` is read at `supabase start`, so a reset replays
            // migrations into containers still holding the old settings.
            hint: "the only way to pick up config.toml — reset will not",
            scope: "machine",
            when: "instance-running",
          },
          // ── repo — files in the repo, no live connection ───────────────
          {
            name: "migration",
            summary: "Migration files, empty or drafted from schema drift.",
            scope: "repo",
            subcommands: [
              {
                name: "new",
                summary: "Create an empty timestamped migration file.",
              },
              {
                name: "generate",
                summary:
                  "Generate a migration from an app's Drizzle schema drift.",
                options: [
                  {
                    flag: "--app",
                    value: "<slug>",
                    summary: "Whose schema. Asked for when absent.",
                  },
                ],
              },
            ],
          },
          // ── endpoint — the session's database ──────────────────────────
          {
            name: "status",
            summary: "Report the session database's health, URLs and keys.",
            hint: "reads only",
            scope: "endpoint",
            options: [JSON_FLAG],
          },
          {
            name: "migrate",
            summary: "Apply new migrations to the database.",
            hint: "without erasing anything",
            scope: "endpoint",
            options: [YES],
          },
          {
            name: "reset",
            summary: "Rebuild the database: migrations, seeds, types, buckets.",
            hint: "⚠️  erases the database first",
            scope: "endpoint",
            options: [YES],
          },
          {
            name: "types",
            summary:
              "Regenerate database.types.ts, format it, rebuild the package.",
            hint: "after any schema change",
            scope: "endpoint",
            options: [],
          },
          {
            name: "seed",
            summary: "Seed storage buckets or the platform's role catalogue.",
            scope: "endpoint",
            subcommands: [
              {
                name: "buckets",
                summary: "Create the storage buckets config.toml declares.",
                options: [],
              },
              {
                name: "roles",
                summary: "Reconcile the platform's role catalogue.",
                options: [],
              },
            ],
          },
          {
            name: "introspect",
            summary:
              "Pull an app's live schema into its generated Drizzle files.",
            scope: "endpoint",
            options: [
              {
                flag: "--app",
                value: "<slug>",
                summary: "App whose schema to pull. Asked for when absent.",
              },
            ],
          },
          {
            name: "config",
            summary:
              "The Supabase config.toml, pushed to the session's project.",
            scope: "endpoint",
            subcommands: [
              {
                name: "push",
                summary: "Push config.toml to the session's hosted project.",
                hint: "hosted sessions only",
                options: [],
              },
            ],
          },
          // ── infra — hosted infrastructure, each naming its own connection
          {
            name: "planner",
            summary: "The migration_planner role the preflight tier may hold.",
            scope: "infra",
            subcommands: [
              {
                name: "status",
                summary:
                  "Does the role exist, hold its two grants, and no more.",
                hint: "reads only — start here",
                options: [DB_URL, JSON_FLAG],
              },
              {
                name: "create",
                summary: "Mint the role, verify it live, write .env.preflight.",
                options: [DB_URL],
              },
              {
                name: "reset-password",
                summary: "Rotate the password. There is no retrieve.",
                options: [DB_URL, YES],
              },
              {
                name: "drop",
                summary: "Remove the role and blank the dead URL.",
                hint: "the recovery path",
                options: [DB_URL, YES],
              },
            ],
          },
          {
            name: "signing-key",
            summary: "SUPABASE_JWT_SIGNING_KEY: mint, register, inspect.",
            scope: "infra",
            subcommands: [
              {
                name: "status",
                summary: "List the project's signing keys.",
                hint: "reads only — start here",
                options: [SIGNING_TARGET, JSON_FLAG],
              },
              {
                name: "generate",
                summary: "Mint a 64-char HS256 secret into .env.<target>.",
                hint: "confirmed overwrite = rotation",
                options: [SIGNING_TARGET, YES],
              },
              {
                name: "import",
                summary:
                  "Register that secret with the project as a standby key.",
                options: [SIGNING_TARGET],
              },
            ],
          },
          // ── unscoped — the escape hatch ─────────────────────────────────
          {
            name: "exec",
            summary:
              "Run the Supabase CLI. Everything after -- passes through.",
            hint: "the escape hatch",
          },
        ],
      },
    ],
  },
  {
    title: "Cloudflare",
    commands: [
      {
        name: "cf",
        summary: "Develop and build an app on the Workers runtime.",
        hint: "preview, typegen — deploys live in CI",
        subcommands: [
          {
            name: "preview",
            summary: "Build and serve an app on the Workers runtime.",
            options: [
              {
                flag: "--app",
                value: "<slug>",
                summary: "App to preview. Asked for when absent.",
                prompt: {
                  kind: "select",
                  message: "Which app?",
                  choices: WORKER_APP_CHOICES,
                },
              },
              {
                flag: "--tier",
                value: "<t>",
                summary:
                  "Preview against a tier's env. Defaults to development.",
                // No prompt: the runtime resolver (`tier.ts`) asks this
                // itself, conditionally, for both the wizard and a direct
                // CLI invocation — a `prompt` here would ask it twice, once
                // on this screen and once when the command actually runs.
              },
              YES,
            ],
          },
          {
            name: "typegen",
            summary: "Regenerate cloudflare-env.d.ts from the wrangler config.",
            options: [
              {
                flag: "--app",
                value: "<slug>",
                summary: "App to run typegen for. Asked for when absent.",
                prompt: {
                  kind: "select",
                  message: "Which app?",
                  choices: WORKER_APP_CHOICES,
                },
              },
              {
                flag: "--check",
                summary: "Check types only — do not write.",
                prompt: {
                  kind: "confirm",
                  message: "Check only (do not write)?",
                  initial: true,
                },
              },
            ],
          },
          {
            name: "build",
            summary: "Build an app's Worker bundle for a tier.",
            options: [
              {
                flag: "--app",
                value: "<slug>",
                summary: "App to build. Asked for when absent.",
                prompt: {
                  kind: "select",
                  message: "Which app?",
                  choices: WORKER_APP_CHOICES,
                },
              },
              {
                flag: "--tier",
                value: "<t>",
                summary: "Which deployment tier to build for.",
                prompt: {
                  kind: "select",
                  message: "Which tier?",
                  choices: [
                    { value: "staging" },
                    { value: "production", hint: "⚠️  live bundle" },
                  ],
                },
              },
            ],
          },
          {
            name: "exec",
            summary: "Run wrangler. Everything after -- passes through.",
            hint: "the escape hatch",
          },
        ],
      },
    ],
  },
];

/**
 * The contributor-facing navigation, grouped by the job somebody is doing.
 *
 * Command declarations stay close to their domain-specific option data above;
 * this projection is the one place that decides how the root help and menu
 * read. Paths do not change when a command moves between groups.
 */
const declaredByName = new Map(
  DECLARED_GROUPS.flatMap((group) => group.commands).map((command) => [
    command.name,
    command,
  ]),
);

function commands(...names: string[]): CommandNode[] {
  return names.map((name) => {
    const command = declaredByName.get(name);
    if (!command) throw new Error(`Command "${name}" is not declared.`);
    return command;
  });
}

export const GROUPS: readonly CommandGroup[] = [
  {
    title: "Workspace",
    commands: commands("setup", "oauth", "run", "gen", "docs"),
  },
  {
    title: "Runtime & infrastructure",
    commands: commands("db", "cf", "cron", "workflows"),
  },
  {
    title: "Content & communications",
    commands: commands("images", "emails", "newsletter"),
  },
  {
    title: "Configuration & integrations",
    commands: commands("env", "bw", "airtable"),
  },
  {
    title: "Moderation",
    commands: commands("catalog", "doctor", "roundtrip", "grant-root"),
  },
  {
    title: "CLI utilities",
    commands: commands("completions"),
  },
];

// ── CI command tree ───────────────────────────────────────────────────────────

/**
 * The commands the `devtools-ci` bin exposes.
 *
 * Kept separate from `GROUPS` because CI commands are never reached from the
 * wizard and never rendered in `--help`. They live here so the docs build can
 * render a CI reference page from the same declaration, and so the tests that
 * guard the style guide can cover both trees without duplicating the pins.
 */
export const CI_GROUPS: readonly CommandGroup[] = [
  {
    title: "Deploy",
    commands: [
      {
        name: "deploy",
        summary: "Deploy an app: token gate, per-app steps, upload.",
        options: [TIER, DRY_RUN],
        subcommands: [
          // ── App orchestrators ────────────────────────────────────────────
          {
            name: "platform",
            summary: "Deploy the platform app.",
            options: [TIER, DRY_RUN],
          },
          {
            name: "schedule-builder",
            summary: "Deploy the schedule-builder app.",
            options: [TIER, DRY_RUN],
          },
          {
            name: "sandbox",
            summary: "Deploy the sandbox app.",
            options: [TIER, DRY_RUN],
          },
          // ── Step commands ────────────────────────────────────────────────
          {
            name: "write-env",
            summary: "Compose .env.<DEPLOY_ENV> from the GitHub environment.",
            options: [
              {
                flag: "--source",
                value: "<manifest>",
                summary: "Compose one manifest's slice instead of all.",
              },
            ],
          },
          {
            name: "secrets-file",
            summary: "Write the --secrets-file wrangler uploads with a Worker.",
            options: [
              {
                flag: "--app",
                value: "<app>",
                summary: "Whose manifest declares the Worker's secrets.",
              },
              {
                flag: "--mint",
                summary: "Mint the sandbox proxy JWT into it.",
              },
            ],
          },
          {
            name: "orphans",
            summary: "Report Worker secrets nothing declares.",
            options: [
              {
                flag: "--prune",
                summary: "Delete them. production-apply only.",
              },
            ],
          },
          {
            name: "preflight",
            summary: "Classify the project: paused (skip) vs broken (fail).",
          },
          {
            name: "mint-token",
            summary: "Sign a fresh sandbox proxy JWT to stdout.",
          },
          {
            name: "require-token",
            summary: "Refuse to deploy without CLOUDFLARE_API_TOKEN.",
          },
          {
            name: "require-planner",
            summary: "Refuse to plan unless DB_URL is the planner role.",
          },
          {
            name: "airtable-plan",
            summary: "What a scaffold would create. Reads only.",
          },
          {
            name: "airtable-apply",
            summary: "Create it. production-apply only.",
          },
        ],
      },
    ],
  },
];

// ── Lookup ───────────────────────────────────────────────────────────────────

/** Every top-level command, in group order. */
export const TOP_LEVEL: readonly CommandNode[] = GROUPS.flatMap(
  (group) => group.commands,
);

/** Every top-level CI command, in group order. */
export const CI_TOP_LEVEL: readonly CommandNode[] = CI_GROUPS.flatMap(
  (group) => group.commands,
);

/**
 * Walks a path in the CI tree, returning `null` at the first miss.
 *
 * Identical to `findCommand` but over `CI_TOP_LEVEL` rather than `TOP_LEVEL`.
 */
export function findCiCommand(path: readonly string[]): CommandNode | null {
  let nodes: readonly CommandNode[] = CI_TOP_LEVEL;
  let found: CommandNode | null = null;

  for (const name of path) {
    const next = nodes.find((node) => node.name === name);
    if (!next) return null;
    found = next;
    nodes = next.subcommands ?? [];
  }

  return found;
}

/** The subcommand names under a CI path. */
export function subcommandCiNames(path: readonly string[]): string[] {
  return (findCiCommand(path)?.subcommands ?? []).map((node) => node.name);
}

/**
 * Walks a path like `["env", "pull"]`, returning `null` at the first miss.
 *
 * Callers use `null` to mean "not a command", which is the same answer the
 * dispatcher gives, so an unknown name reads the same whichever notices first.
 */
export function findCommand(path: readonly string[]): CommandNode | null {
  let nodes: readonly CommandNode[] = TOP_LEVEL;
  let found: CommandNode | null = null;

  for (const name of path) {
    const next = nodes.find((node) => node.name === name);
    if (!next) return null;
    found = next;
    nodes = next.subcommands ?? [];
  }

  return found;
}

/** The group a top-level command sits in, for the wizard's first screen. */
export function groupOf(name: string): CommandGroup | undefined {
  return GROUPS.find((group) =>
    group.commands.some((command) => command.name === name),
  );
}

/**
 * The subcommand names under a path, in the order they are declared.
 *
 * This is what the dispatchers in `cli.ts` validate against. A subcommand the
 * tree does not declare is refused by the CLI, and an interactive one it does
 * declare is in the menu. There is one list, and this reads it.
 */
export function subcommandNames(path: readonly string[]): string[] {
  return (findCommand(path)?.subcommands ?? []).map((node) => node.name);
}

/** `pull, push, audit, init, example or reset`, for a refusal message. */
export function subcommandList(path: readonly string[]): string {
  const names = subcommandNames(path);
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]!}`;
}

/**
 * Every command path in the tree, deepest names included.
 *
 * Used by the coverage test, and by anything that wants to enumerate the CLI
 * (the docs build's reference page is the intended second caller).
 */
export function allPaths(): string[][] {
  const paths: string[][] = [];

  const visit = (nodes: readonly CommandNode[], prefix: string[]): void => {
    for (const node of nodes) {
      const path = [...prefix, node.name];
      paths.push(path);
      visit(node.subcommands ?? [], path);
    }
  };

  visit(TOP_LEVEL, []);
  return paths;
}
