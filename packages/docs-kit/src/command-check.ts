/**
 * A FAILING check, in the same family as `link-check.ts`: a shell sample that
 * names a command this monorepo does not have is not a style question, it is
 * a step a student will copy into a terminal on the Sunday before
 * competitions and watch fail.
 *
 * Two shapes, both pulled from fenced samples in `sh`, `bash`, `shell`,
 * `console`, `powershell`, `ps1` or `zsh` (parsed the same way
 * `link-check.ts` parses links, so a command mentioned in prose or inside a
 * different language's fence is never mistaken for one to run):
 *
 *   - `pnpm devtools <path...>` and `pnpm backstage <path...>` are checked
 *     against `devtoolsCommands` / `backstageCommands`, every path that CLI's
 *     own command tree declares. Those sets are parameters rather than
 *     anything this file knows on its own — see the header of `cli-catalog.ts`
 *     for what loads them in practice. Flags (and, where obvious, their values) are stripped before matching,
 *     and the check takes the *longest* prefix of what is left that the
 *     catalog declares: a leaf command (nothing in the catalog starts with
 *     `"<path> "`) accepts any positional args after it
 *     (`pnpm devtools emails TeamInvite`, `pnpm devtools images 'page/*'`),
 *     while a group only fails when a further token is given that is not one
 *     of its children — a bare group with nothing after it is left alone.
 *   - `pnpm --filter <pkg> [run] <script>` and a bare `pnpm run <script>` are
 *     checked against the workspace's own `package.json`s (`workspace.ts`). A
 *     bare `pnpm run` has no `--filter` to name the package, so it is read as
 *     running inside the app the docs page is about (`apps/<project-slug>`
 *     when it exists), or the workspace root otherwise — the two places a
 *     contributor is actually standing when a written command says `pnpm run`
 *     with nothing else. A `--filter` value that is a path selector (`./x`)
 *     or carries pnpm's dependency-graph suffixes (`...`, `^...`) names a
 *     *set* of packages this check has no way to resolve, so it is left
 *     alone rather than failed for not being a literal package name.
 *
 * A line can chain several commands (`&&`, `||`, `;`, `|`) and only one of
 * them need be `pnpm`; each segment is checked on its own. A line can also
 * continue onto the next with a trailing `\`, the shape a long `pnpm devtools
 * … --flag value \` sample wraps onto several lines — continuations are
 * joined back into one logical line before anything else runs, so a flag's
 * value on the next physical line is never mistaken for the command's next
 * positional argument. A segment that mentions a placeholder token
 * (`<app>`, `{app}`) is left unchecked entirely: it is a stand-in the reader
 * is meant to fill in, not a command this repo can look up.
 *
 * A fence opts out entirely with a `nocheck` meta word (` ```sh nocheck `),
 * for the rare page that shows a command exactly to say it is wrong.
 */
import type { Code } from "mdast";
import { visit } from "unist-util-visit";
import { parseBody } from "./parse.js";
import type { CompiledPage } from "./types.js";
import type { WorkspacePackage } from "./workspace.js";

const SHELL_LANGS = new Set([
  "sh",
  "bash",
  "shell",
  "console",
  "powershell",
  "ps1",
  "zsh",
]);

export interface CommandCheckError {
  file: string;
  line: number | null;
  message: string;
}

export interface CommandCheckOptions {
  /**
   * Every valid `devtools` command path, each one space-joined
   * (`"db migration new"`), intermediate group paths included (`"db"` is in
   * this set as well as `"db migration new"`, matching what
   * `devtools --help --json` lists).
   */
  devtoolsCommands: ReadonlySet<string>;
  /** The same for `backstage` (`"deploy smoke"`, `"deploy"`, …). */
  backstageCommands: ReadonlySet<string>;
  /** Every workspace package, for `pnpm --filter`. */
  packages: readonly WorkspacePackage[];
  /** `apps/<slug>` packages keyed by slug, for a bare `pnpm run`. */
  appBySlug: ReadonlyMap<string, WorkspacePackage>;
  /** The workspace root's own scripts, a bare `pnpm run`'s other fallback. */
  rootPackage: WorkspacePackage | null;
}

export function checkCommands(
  pages: readonly CompiledPage[],
  options: CommandCheckOptions,
): CommandCheckError[] {
  const byPackageName = new Map<string, WorkspacePackage>();
  for (const pkg of options.packages) {
    byPackageName.set(pkg.name, pkg);
    const base = pkg.dir.split("/").at(-1);
    if (base !== undefined && !byPackageName.has(base)) {
      byPackageName.set(base, pkg);
    }
  }

  const errors: CommandCheckError[] = [];

  for (const page of pages) {
    const file =
      page.mountedFrom !== null
        ? `_shared/${page.mountedFrom}.md`
        : `${page.path}.md`;
    const tree = parseBody(page.content, page.variants);

    visit(tree, "code", (node: Code) => {
      const lang = (node.lang ?? "").toLowerCase();
      if (!SHELL_LANGS.has(lang)) return;
      if ((node.meta ?? "").split(/\s+/).includes("nocheck")) return;

      const startLine = node.position?.start.line ?? null;
      const rawLines = node.value.split("\n");

      for (const { text, startIndex } of joinContinuations(rawLines)) {
        const line = startLine === null ? null : startLine + 1 + startIndex;
        checkLine(text, line, page, file, options, byPackageName, errors);
      }
    });
  }

  return errors;
}

/**
 * Merges a `\`-continued physical line with what follows it, so a sample that
 * wraps one long command onto several lines is checked as the one logical
 * line it is. `startIndex` is the first physical line's index (0-based, into
 * the fence's own lines), which is what a reported error points at.
 */
function joinContinuations(
  lines: readonly string[],
): { text: string; startIndex: number }[] {
  const out: { text: string; startIndex: number }[] = [];
  let i = 0;

  while (i < lines.length) {
    const startIndex = i;
    let text = (lines[i] ?? "").replace(/\s+$/, "");

    while (text.endsWith("\\") && i + 1 < lines.length) {
      text = text.slice(0, -1).replace(/\s+$/, "");
      i++;
      text = `${text} ${(lines[i] ?? "").trim()}`.replace(/\s+$/, "");
    }

    out.push({ text, startIndex });
    i++;
  }

  return out;
}

function checkLine(
  raw: string,
  line: number | null,
  page: CompiledPage,
  file: string,
  options: CommandCheckOptions,
  byPackageName: ReadonlyMap<string, WorkspacePackage>,
  errors: CommandCheckError[],
): void {
  const trimmed = stripPromptAndComment(raw);

  for (const segment of splitSegments(trimmed)) {
    checkSegment(segment, line, page, file, options, byPackageName, errors);
  }
}

/** A chained shell line, split on `&&`, `||`, `;` and `|` (in that order, so `||` is never read as two `|`s). */
function splitSegments(line: string): string[] {
  return line
    .split(/&&|\|\||;|\|/)
    .map((segment) => segment.trim())
    .filter((segment) => segment !== "");
}

/** A stand-in the reader is meant to fill in (`<app>`, `{app}`), not a real value. */
function hasPlaceholder(token: string): boolean {
  return /[<{][^\s<>{}]*[>}]/.test(token);
}

function checkSegment(
  segment: string,
  line: number | null,
  page: CompiledPage,
  file: string,
  options: CommandCheckOptions,
  byPackageName: ReadonlyMap<string, WorkspacePackage>,
  errors: CommandCheckError[],
): void {
  const tokens = tokenize(segment);
  if (tokens.length === 0 || tokens[0] !== "pnpm") return;
  if (tokens.some(hasPlaceholder)) return;

  if (tokens[1] === "devtools" || tokens[1] === "backstage") {
    const cli = tokens[1];
    checkCliCommand(
      cli,
      cli === "devtools" ? options.devtoolsCommands : options.backstageCommands,
      tokens.slice(2),
      line,
      file,
      errors,
    );
    return;
  }

  if (tokens[1] === "--filter") {
    const packageName = tokens[2];
    if (packageName === undefined) return;

    if (isUnresolvableSelector(packageName)) return;

    let rest = tokens.slice(3);
    if (rest[0] === "run") rest = rest.slice(1);
    const script = rest[0];
    if (script === undefined) return;

    const pkg = byPackageName.get(packageName);
    if (pkg === undefined) {
      errors.push({
        file,
        line,
        message: `"pnpm --filter ${packageName}" names a package this workspace does not have`,
      });
      return;
    }

    if (!pkg.scripts.has(script)) {
      errors.push({
        file,
        line,
        message: `"${packageName}" has no "${script}" script`,
      });
    }
    return;
  }

  if (tokens[1] === "run") {
    const script = tokens[2];
    if (script === undefined) return;

    const current = options.appBySlug.get(page.project) ?? options.rootPackage;
    if (current === null || current === undefined) return;

    if (!current.scripts.has(script)) {
      errors.push({
        file,
        line,
        message: `"pnpm run ${script}" — ${current.name} has no "${script}" script`,
      });
    }
  }
}

/**
 * A `--filter` value naming a *set* of packages rather than one literal
 * name: a path selector (`./apps/platform`, `../foo`), or pnpm's
 * dependency-graph suffixes (`pkg...`, `...pkg`, `pkg^...`). This check has
 * no workspace graph to resolve either against, so it leaves them alone
 * rather than failing a filter that may well be exactly right.
 */
function isUnresolvableSelector(value: string): boolean {
  return (
    value.startsWith("./") ||
    value.startsWith("../") ||
    value.startsWith("/") ||
    value.includes("...")
  );
}

function checkCliCommand(
  cli: string,
  catalog: ReadonlySet<string>,
  rest: readonly string[],
  line: number | null,
  file: string,
  errors: CommandCheckError[],
): void {
  const tokens = stripFlags(rest);
  if (tokens.length === 0) return; // bare `pnpm <cli>`: nothing to check.

  let matchLen = 0;
  for (let k = 1; k <= tokens.length; k++) {
    if (catalog.has(tokens.slice(0, k).join(" "))) matchLen = k;
  }

  if (matchLen === 0) {
    errors.push({
      file,
      line,
      message: `"pnpm ${cli} ${tokens.join(" ")}" is not a ${cli} command`,
    });
    return;
  }

  const matchedPath = tokens.slice(0, matchLen).join(" ");
  const nextToken = tokens[matchLen];

  // A group only fails when there is a further token that is not one of its
  // children — which, since `matchLen` is the *longest* matching prefix, is
  // exactly what a leftover next token means. A bare group with nothing after
  // it is left alone: "if unsure, allow bare groups".
  if (nextToken !== undefined && isGroup(matchedPath, catalog)) {
    errors.push({
      file,
      line,
      message: `"pnpm ${cli} ${tokens.join(" ")}" is not a ${cli} command`,
    });
  }
}

/** Whether `path` is a proper prefix of some other catalog path — a group rather than a leaf. */
function isGroup(path: string, catalog: ReadonlySet<string>): boolean {
  const prefix = `${path} `;
  for (const entry of catalog) {
    if (entry.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * Drops flag tokens, and — where obvious — the value token immediately after
 * one: a `--key value` pair each stay together, so `value` is never mistaken
 * for the command's next positional argument. `--key=value` needs no such
 * pairing, since it is already one token. What is left over, in order, is the
 * command's own path plus whatever real positional args followed it.
 */
function stripFlags(tokens: readonly string[]): string[] {
  const out: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (!token.startsWith("-")) {
      out.push(token);
      continue;
    }
    if (token.includes("=")) continue;

    const next = tokens[i + 1];
    if (next !== undefined && !next.startsWith("-")) i++; // consume its value too.
  }

  return out;
}

/** Drops a leading shell prompt (`$ `, `> `) and a trailing `# comment`. */
function stripPromptAndComment(line: string): string {
  const withoutPrompt = line.replace(/^\s*[$>]\s+/, "");
  const hash = withoutPrompt.indexOf(" #");
  return (hash === -1 ? withoutPrompt : withoutPrompt.slice(0, hash)).trim();
}

function tokenize(line: string): string[] {
  return line.split(/\s+/).filter((token) => token !== "");
}
