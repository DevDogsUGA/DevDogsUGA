import { allPaths } from "./commands.js";

type Shell = "bash" | "zsh";

/**
 * Groups all paths by their parent prefix to build per-parent completion lists.
 *
 * e.g. ["env", "pull"] contributes "pull" to the group keyed "env".
 */
function buildGroups(): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const path of allPaths()) {
    const parent = path.slice(0, -1).join(" ");
    const name = path[path.length - 1]!;
    const existing = groups.get(parent) ?? [];
    existing.push(name);
    groups.set(parent, existing);
  }
  return groups;
}

function generateBash(): string {
  const groups = buildGroups();
  const topLevel = (groups.get("") ?? []).join(" ");

  const cases: string[] = [];
  for (const [parent, children] of groups) {
    if (!parent) continue;
    // Match "devtools <parent>" — the last typed word before cursor is a subcommand
    cases.push(`        "${parent}") words="${children.join(" ")}" ;;`);
  }

  return [
    "# devtools bash completion",
    "# Source this file or add it to /etc/bash_completion.d/",
    '#   eval "$(pnpm devtools completions --shell bash)"',
    "_devtools_complete() {",
    '    local cur="${COMP_WORDS[COMP_CWORD]}"',
    '    local prev="${COMP_WORDS[COMP_CWORD-1]}"',
    '    local words=""',
    "",
    "    # Build the command path from all words except the last",
    '    local cmd=""',
    "    for ((i=1; i<COMP_CWORD; i++)); do",
    '        local w="${COMP_WORDS[$i]}"',
    '        if [[ "$w" != --* ]]; then',
    '            cmd="${cmd:+$cmd }$w"',
    "        fi",
    "    done",
    "",
    '    case "$cmd" in',
    ...cases,
    `        "") words="${topLevel}" ;;`,
    "    esac",
    "",
    '    COMPREPLY=($(compgen -W "$words" -- "$cur"))',
    "}",
    "complete -F _devtools_complete devtools",
    "",
  ].join("\n");
}

function generateZsh(): string {
  const groups = buildGroups();
  const topLevel = (groups.get("") ?? []).join(" ");

  const cases: string[] = [];
  for (const [parent, children] of groups) {
    if (!parent) continue;
    cases.push(`        "${parent}") words=(${children.join(" ")}) ;;`);
  }

  return [
    "#compdef devtools",
    "# devtools zsh completion",
    "# Add to your .zshrc:",
    '#   eval "$(pnpm devtools completions --shell zsh)"',
    "_devtools() {",
    "    local state words",
    `    local -a top_level=(${topLevel})`,
    "",
    "    # Build the command path from all words except the last",
    '    local cmd=""',
    "    local -i i",
    "    for ((i=2; i<CURRENT; i++)); do",
    '        local w="${words[$i]}"',
    '        if [[ "$w" != --* ]]; then',
    '            cmd="${cmd:+$cmd }$w"',
    "        fi",
    "    done",
    "",
    '    local -a completions=("${top_level[@]}")',
    '    case "$cmd" in',
    ...cases,
    "        *) ;;",
    "    esac",
    "",
    "    compadd -a completions",
    "}",
    "_devtools",
    "",
  ].join("\n");
}

export function generateCompletions(shell: Shell): string {
  return shell === "zsh" ? generateZsh() : generateBash();
}

export function runCompletions(argv: string[]): number {
  const shellIdx = argv.indexOf("--shell");
  const shell = shellIdx !== -1 ? argv[shellIdx + 1] : undefined;

  if (shell !== "bash" && shell !== "zsh") {
    process.stderr.write(
      "devtools completions: --shell must be bash or zsh.\n" +
        "Example: pnpm devtools completions --shell bash\n",
    );
    return 1;
  }

  process.stdout.write(generateCompletions(shell));
  return 0;
}
