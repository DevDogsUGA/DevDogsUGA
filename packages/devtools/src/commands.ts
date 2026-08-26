/**
 * The command tree, as data.
 *
 * One declaration, three readers:
 *
 *   * `help.ts` renders it, one level at a time.
 *   * `menu.ts` walks it, so the wizard reaches every command and every option
 *     without a second list to keep in step.
 *   * the docs build reads it for the CLI reference page (see the rewrite
 *     plan's §11.3: the registry generators stay in devtools).
 *
 * It is deliberately inert — names, summaries and option shapes, no imports of
 * anything that runs. `cli.ts` owns dispatch; the wizard turns a walk of this
 * tree into an argv and hands it to that same dispatcher, which is what keeps
 * "the menu covers the CLI" true by construction rather than by review.
 *
 * ## What a summary is for
 *
 * Every `summary` is one line and is the ONLY thing `--help` prints for a
 * command at the level above it. Rationale, target tables, credential lookup
 * order and deploy internals live in `docs/`, not here: `--help` is a map, and
 * a map that reprints the territory is the thing this replaced.
 */

/**
 * One choice in a select prompt.
 *
 * A `value` that starts with `--` IS the flag (the database target is three
 * mutually exclusive booleans wearing one option); anything else is a value
 * for the option's own flag. `argValue` covers the one choice that takes a
 * further word — `--team <slug>` — so the wizard asks for it in place rather
 * than emitting a flag with nothing after it.
 */
export interface OptionChoice {
  value: string;
  label?: string;
  hint?: string;
  argValue?: { message: string; placeholder?: string };
}

/**
 * A prompt the wizard raises to fill an option the command line would carry.
 *
 * `confirm` has no polarity switch on purpose: **yes adds the flag**, always.
 * Every message here is therefore phrased so that yes is the flag's own
 * meaning ("Skip the duplicate scan?" rather than "Scan for duplicates?"),
 * which keeps the wizard from having a second place to get an inversion
 * wrong.
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
   * Absent means the wizard does not ask HERE, and that is a decision rather
   * than an omission. Three kinds of option are deliberately promptless:
   *
   *   * ones the command asks for ITSELF, from something live — `--app` picks
   *     from the apps in the database, `--user` from the accounts on it,
   *     `--target` from `pick.ts`'s danger-ordered list, `--apps` from the
   *     env registry. A wizard text box would be a worse version of a menu
   *     that already exists, and `--target`'s in particular would put
   *     production one keystroke closer than `pick.ts` deliberately puts it;
   *   * ones that exist to SUPPRESS a prompt (`--yes`) — meaningless in a
   *     wizard, which is the prompt;
   *   * ones that carry a credential (`--access-token`) — the interactive
   *     path already resolves it better, and typing it makes it visible to
   *     `ps` and shell history.
   *
   * So every option is reachable from the menu; what varies is which screen
   * asks. `commands.test.ts` pins the promptless set so a fourth case has to
   * be argued for rather than accumulate.
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
export type Condition = "docker" | "stack-running" | "stack-stopped";

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
   * stopping a stack that is already stopped is the whole of the category.
   * A command that would run and fail with a good message gets `needs`
   * instead — see the two-line rule on `isOffered` in `environment.ts` for
   * why hiding is the rarer of the two.
   *
   * Wizard-only. `--help`, the dispatcher and the generated reference all
   * ignore this, so nothing here removes a command from the CLI.
   */
  when?: Condition;
  /**
   * Offer this always, but say on the line why it will not work right now.
   *
   * The four moderation commands carry it: each one opens a client against
   * the local stack and has no remote path at all, so with the stack down
   * they are a spinner followed by a connection error. The hint turns that
   * into a sentence the reader sees before choosing.
   */
  needs?: Condition;
  /**
   * `"show"` means the wizard prints the invocation instead of running it.
   *
   * Only the `deploy` group uses it. Those steps want a runner's environment
   * (`DEPLOY_ENV`, a GitHub environment's secrets) and two of them have a
   * stdout that something downstream parses, so a wizard that ran them would
   * either fail confusingly on a laptop or overwrite a local env file with a
   * deploy environment's values. They are still fully reachable and fully
   * described here — that is the coverage — and choosing one hands back the
   * exact line to run.
   */
  wizard?: "run" | "show";
}

/** Top-level sections. Only `--help` and the wizard's first screen use these. */
export interface CommandGroup {
  title: string;
  commands: readonly CommandNode[];
}

// ── Shared option shapes ─────────────────────────────────────────────────────

/**
 * `--local | --remote | --team <slug>` for the four database commands.
 *
 * Modelled as ONE option with a select prompt rather than three booleans: they
 * are mutually exclusive, and a wizard that asked three yes/no questions could
 * produce a combination the parser has to break a tie on.
 */
const DATABASE_TARGET: CommandOption = {
  flag: "--local | --remote | --team <slug>",
  summary: "Which database. Defaults to --local.",
  prompt: {
    kind: "select",
    message: "Which database?",
    choices: [
      { value: "--local", label: "My local stack", hint: "the default" },
      { value: "--remote", label: "The linked Supabase project" },
      {
        value: "--team",
        label: "A team sandbox",
        argValue: { message: "Which team?", placeholder: "lantern" },
      },
    ],
  },
};

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

const YES: CommandOption = {
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

export const GROUPS: readonly CommandGroup[] = [
  {
    title: "Start here",
    commands: [
      {
        name: "setup",
        summary: "Check prerequisites and seed .env.",
        hint: "run this first",
      },
    ],
  },
  {
    title: "Your database",
    commands: [
      {
        name: "link",
        summary: "Start (or connect to) a database and write .env.",
        hint: "boots the local stack",
        options: [DATABASE_TARGET],
      },
      {
        name: "stop",
        summary: "Shut the local stack down, freeing its containers.",
        hint: "local only — your data survives",
        // Not offered while nothing is running: "stop" against a stopped
        // stack is the one shape of question a menu should never ask.
        when: "stack-running",
      },
      {
        name: "restart",
        summary: "Stop the local stack, then start it again.",
        hint: "picks up config.toml changes",
        when: "stack-running",
      },
      {
        name: "push",
        summary: "Apply new migrations.",
        hint: "without erasing anything",
        options: [DATABASE_TARGET],
      },
      {
        name: "reset",
        summary: "Rebuild from migrations, then seeds.",
        hint: "⚠️  erases the database first",
        options: [DATABASE_TARGET],
      },
      {
        name: "status",
        summary: "Report the target's health.",
        options: [DATABASE_TARGET],
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
        needs: "stack-running",
      },
      {
        name: "doctor",
        summary: "Check an app's moderation integration.",
        hint: "and whether the catalog holds up",
        needs: "stack-running",
        options: [
          {
            flag: "--app",
            value: "<slug>",
            summary: "App to check. Asked for when absent.",
          },
        ],
      },
      {
        name: "roundtrip",
        summary: "File a report, quarantine it, and check the freeze.",
        hint: "end to end, then cleans up",
        needs: "stack-running",
      },
      {
        name: "grant-root",
        summary: "Give an account every permission on your own database.",
        needs: "stack-running",
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
            name: "verify",
            summary: "Diff the live base against the registry.",
            hint: "reads only — start here",
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
            ],
          },
          {
            name: "scaffold",
            summary: "Create what the registry declares.",
            hint: "writes to the base",
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
          {
            name: "pull-ids",
            summary: "Write discovered ids into registry.ts.",
            hint: "edits a committed source file",
          },
          {
            name: "snapshot",
            summary: "Refresh the committed schema snapshot.",
            hint: "or check it, as CI does",
            options: [
              {
                flag: "--check",
                summary: "Verify the snapshot is current. Needs no token.",
                prompt: {
                  kind: "confirm",
                  message: "Check only, without refreshing the committed file?",
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
            hint: "local database unless --force",
            options: [
              {
                flag: "--force",
                summary: "Allow a non-local database. It deletes stale rows.",
                prompt: {
                  kind: "confirm",
                  message:
                    "Allow a NON-local database, replacing its live index?",
                  initial: false,
                },
              },
            ],
          },
        ],
      },
    ],
  },
  {
    title: "Operator",
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
            options: [VAULT_TARGET, ENV_FILE, YES, ACCESS_TOKEN],
          },
          {
            name: "init",
            summary: "Create a fresh file for a target.",
            hint: "refuses to touch one that exists",
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
        name: "planner",
        summary: "The migration_planner role the preflight tier may hold.",
        subcommands: [
          {
            name: "status",
            summary: "Does the role exist, hold its two grants, and no more.",
            hint: "reads only — start here",
            options: [DB_URL],
          },
          {
            name: "create",
            summary: "Mint the role, verify it live, write .env.preflight.",
            options: [DB_URL],
          },
          {
            name: "reset-password",
            summary: "Rotate the password. There is no retrieve.",
            options: [DB_URL],
          },
          {
            name: "drop",
            summary: "Remove the role and blank the dead URL.",
            hint: "the recovery path",
            options: [DB_URL],
          },
        ],
      },
      {
        name: "signing-key",
        summary: "SUPABASE_JWT_SIGNING_KEY: mint, register, inspect.",
        subcommands: [
          {
            name: "status",
            summary: "List the project's signing keys.",
            hint: "reads only — start here",
            options: [SIGNING_TARGET],
          },
          {
            name: "generate",
            summary: "Mint a 64-char HS256 secret into .env.<target>.",
            hint: "confirmed overwrite = rotation",
            options: [SIGNING_TARGET],
          },
          {
            name: "import",
            summary: "Register that secret with the project as a standby key.",
            options: [SIGNING_TARGET],
          },
        ],
      },
    ],
  },
  {
    title: "Deploy",
    commands: [
      {
        name: "deploy",
        summary: "The steps a deploy job runs. Not for a laptop.",
        wizard: "show",
        subcommands: [
          {
            name: "write-env",
            summary: "Compose .env.<DEPLOY_ENV> from the GitHub environment.",
            wizard: "show",
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
            wizard: "show",
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
            wizard: "show",
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
            wizard: "show",
          },
          {
            name: "mint-token",
            summary: "Sign a fresh sandbox proxy JWT to stdout.",
            wizard: "show",
          },
          {
            name: "require-token",
            summary: "Refuse to deploy without CLOUDFLARE_API_TOKEN.",
            wizard: "show",
          },
          {
            name: "require-planner",
            summary: "Refuse to plan unless DB_URL is the planner role.",
            wizard: "show",
          },
          {
            name: "airtable-plan",
            summary: "What a scaffold would create. Reads only.",
            wizard: "show",
          },
          {
            name: "airtable-apply",
            summary: "Create it. production-apply only.",
            wizard: "show",
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
 * This is what the dispatchers in `cli.ts` validate against, and it is why
 * "the wizard covers every command" needs no test to stay true: a subcommand
 * the tree does not declare is refused by the CLI too, and one it does
 * declare is in the menu. There is one list, and this reads it.
 */
export function subcommandNames(path: readonly string[]): string[] {
  return (findCommand(path)?.subcommands ?? []).map((node) => node.name);
}

/** `pull, push, audit, init, example or reset` — for a refusal message. */
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
