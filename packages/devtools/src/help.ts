/**
 * `--help`, one level at a time.
 *
 * ## Why this is small
 *
 * The help this replaced was ~200 lines and printed the whole tree — every
 * subcommand of every group, the Bitwarden target table, the four places an
 * access token is looked for, the grants `migration_planner` holds, and which
 * deploy steps must avoid the `with-env` wrapper. A contributor running
 * `pnpm devtools --help` to find out how to start a database read all of it.
 *
 * Two rules now:
 *
 *   1. **A level prints its own children and stops.** `--help` lists the
 *      top-level commands; `env --help` lists env's subcommands; `env pull
 *      --help` lists that command's options. Depth is reached by asking for
 *      it.
 *   2. **No more than the caller needs to choose.** Operator internals —
 *      which project a target maps to, how a credential is resolved, what a
 *      deploy job's environment holds — are `docs/`'s job. Help says what a
 *      command does and what it takes.
 *
 * Both fall out of rendering `commands.ts` rather than hand-writing prose, so
 * neither can rot back into a wall of text one paragraph at a time.
 */
import {
  findCommand,
  GROUPS,
  SCOPES,
  type CommandNode,
  type CommandOption,
  type Scope,
} from "./commands.js";

const INDENT = "  ";

/** `--target <t>`, or `--prune` for a boolean. */
function optionLabel(option: CommandOption): string {
  return option.value ? `${option.flag} ${option.value}` : option.flag;
}

/**
 * Two columns, with the gutter sized to the widest label in THIS block.
 *
 * Per-block rather than one width for the whole file: `deploy`'s labels are
 * long and `setup`'s are not, and a shared width would indent the short list
 * halfway across the terminal to accommodate a group the reader is not
 * looking at.
 */
function columns(rows: readonly [string, string][]): string[] {
  const width = Math.max(...rows.map(([label]) => label.length));
  return rows.map(
    ([label, text]) => `${INDENT}${label.padEnd(width)}  ${text}`,
  );
}

/**
 * A group's commands, split into scope blocks when it declares any.
 *
 * Only the Supabase group does. "Supabase" is one word covering the stack and
 * the Postgres database inside it, and a flat list of six leaves the reader to
 * work out which of `restart` and `reset` is which — the distinction that
 * actually costs people an afternoon. A group with no scopes renders exactly
 * as it did: one block, one indent, no headings.
 *
 * The blocks follow declaration order rather than `SCOPES` order, so the tree
 * stays the one place that decides how the group reads. The gutter is sized
 * across the whole group, not per block, so the two blocks line up with each
 * other rather than each finding its own column.
 */
function groupBody(commands: readonly CommandNode[]): string[] {
  if (!commands.some((command) => command.scope)) {
    return columns(childRows(commands));
  }

  const width = Math.max(...commands.map((command) => command.name.length));
  const lines: string[] = [];
  let open: Scope | undefined;

  for (const command of commands) {
    if (command.scope && command.scope !== open) {
      open = command.scope;
      lines.push(`${INDENT}${SCOPES[open].help}:`);
    }
    lines.push(
      `${INDENT.repeat(2)}${command.name.padEnd(width)}  ${command.summary}`,
    );
  }

  return lines;
}

function optionRows(options: readonly CommandOption[]): [string, string][] {
  return options.map((option) => [optionLabel(option), option.summary]);
}

function childRows(children: readonly CommandNode[]): [string, string][] {
  return children.map((child) => [child.name, child.summary]);
}

// ── The three levels ─────────────────────────────────────────────────────────

/** `pnpm devtools --help`: the groups, and nothing below them. */
function renderRoot(): string {
  const lines = [
    "pnpm devtools [command] [options]",
    "",
    "Run with no command to choose from a menu.",
  ];

  for (const group of GROUPS) {
    lines.push("", `${group.title}:`, ...groupBody(group.commands));
  }

  lines.push(
    "",
    "Options:",
    ...columns([["--help, -h", "Show this message"]]),
    "",
    "`pnpm devtools <command> --help` shows what that command takes.",
  );

  return lines.join("\n");
}

/** `pnpm devtools <path…> --help`: one command's own children and options. */
function renderCommand(path: readonly string[], node: CommandNode): string {
  const children = node.subcommands ?? [];
  const options = node.options ?? [];
  const trail = path.join(" ");

  const usage = [
    "pnpm devtools",
    trail,
    children.length > 0 ? "<subcommand>" : "",
    options.length > 0 ? "[options]" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const lines = [usage, "", node.summary];

  if (children.length > 0) {
    lines.push("", "Subcommands:", ...columns(childRows(children)));
  }

  if (options.length > 0) {
    lines.push("", "Options:", ...columns(optionRows(options)));
  }

  if (children.length > 0) {
    lines.push(
      "",
      `\`pnpm devtools ${trail} <subcommand> --help\` shows what that one takes.`,
    );
  }

  return lines.join("\n");
}

/**
 * Renders help for a path, falling back to the root.
 *
 * An unknown path renders the root rather than an error: this is only reached
 * when `--help` was asked for, and answering a mistyped command with the list
 * it was mistyped from is more use than a refusal.
 */
export function renderHelp(path: readonly string[] = []): string {
  if (path.length === 0) return renderRoot();

  const node = findCommand(path);
  if (!node) return renderRoot();

  return renderCommand(path, node);
}

/**
 * The command names in `argv` that precede any flag.
 *
 * `env pull --help` asks about `["env", "pull"]`; `--help env` asks about
 * nothing, because a flag's value is not a command path. Kept separate from
 * `positionals()` — that one strips a known set of value-taking flags to find
 * a subcommand, and here anything after the first flag is not part of the
 * path at all.
 */
export function helpPath(argv: readonly string[]): string[] {
  const path: string[] = [];
  for (const arg of argv) {
    if (arg.startsWith("-")) break;
    path.push(arg);
  }
  return path;
}
