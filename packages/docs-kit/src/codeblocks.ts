/**
 * The frame around every highlighted code block, added while Shiki renders it.
 *
 * ```html
 * <figure class="docs-code" data-kind="code|terminal">
 *   <div class="docs-code-bar">
 *     <span class="docs-code-tab"><svg class="docs-code-icon" data-icon="ts">…</svg>lib/supabase.ts</span>
 *     <div class="docs-code-actions">
 *       <a class="docs-code-vscode" href="vscode://…">…</a>
 *       <a class="docs-code-link" href="…">…</a>
 *       <button class="docs-code-copy" data-copy>…</button>
 *     </div>
 *   </div>
 *   <pre class="shiki">…</pre>
 * </figure>
 * ```
 *
 * The fence's info string drives it, after the language:
 *
 * - `file=<path>` (or `title=<text>`) names the tab; else the language does.
 *   The tab starts with an icon for the file's kind (see codeicons.ts), or a
 *   terminal window for a shell block.
 * - `lines=7-13,15` numbers the lines as those of the file they come from, so
 *   an excerpt keeps its real line numbers; each skip gets an empty
 *   `docs-code-gap` row. Absent, lines count from 1. It must name one number per
 *   line, or the build fails.
 * - `href=<url>` puts a GitHub link in the bar, beside the copy button: where
 *   the code lives in its repository.
 * - `vscode=<uri>` puts a VS Code icon link in the bar, before the GitHub link:
 *   a `vscode://devdogsuga.workshops/review?…` or `…/open?…` link for the
 *   workshops extension (Backstage apps/workshops-vscode). Anything else
 *   fails the build, and a terminal block ignores it. The platform adds the
 *   tab's `session` to the link on click. A `diff file=…` block takes the same
 *   attribute (see `diffs.ts`).
 * - A shell block (`bash`, `sh`, …) is a terminal instead: no line numbers,
 *   and every command gets a prompt, the working directory (`cwd=`, else
 *   none), the git branch once there is one (`branch=`), then ❯. The prompt
 *   follows the commands the way the workshop slides' terminals do
 *   (Backstage apps/slides/theme/lib/shell.ts): `cd` moves it, cloning and
 *   then cd-ing into the clone puts it on `main`, `git switch` changes the
 *   branch. A `#` line is an annotation, dimmed and with no prompt; a line
 *   after one ending in `\` continues the command. An idle prompt closes it.
 *
 * Every literal `<github-username>` in a block, and in a prompt's branch, is
 * wrapped in `<span data-github-username>` (the tokens the highlighter split it
 * into stay inside). The platform swaps in the signed-in reader's GitHub login
 * after hydration; the rendered HTML always has the literal.
 *
 * Line numbers ride a `data-line` attribute and prompts are `aria-hidden`
 * elements, so neither is part of the code's own text: the platform's copy
 * button skips prompts and annotations and copies the commands alone.
 */
import type { Element, ElementContent, Root } from "hast";
import type { Nodes as MdastNodes, Root as MdastRoot } from "mdast";
import type { ShikiTransformer } from "shiki";
import { codeIcon, codeIconSvg } from "./codeicons.js";
import { DocsBuildError } from "./errors.js";

export const SHELL_LANGS = new Set([
  "bash",
  "sh",
  "zsh",
  "shell",
  "shellscript",
  "console",
]);

const LANG_NAMES: Record<string, string> = {
  bash: "Terminal",
  css: "CSS",
  dart: "Dart",
  diff: "Diff",
  dotenv: ".env",
  html: "HTML",
  javascript: "JavaScript",
  js: "JavaScript",
  json: "JSON",
  jsonc: "JSON",
  jsx: "JSX",
  markdown: "Markdown",
  md: "Markdown",
  sql: "SQL",
  text: "Text",
  toml: "TOML",
  ts: "TypeScript",
  tsx: "TSX",
  typescript: "TypeScript",
  yaml: "YAML",
  yml: "YAML",
};

/** `name=value` or `name="a value"` from a fence's info string. */
export function metaAttribute(meta: string, name: string): string | undefined {
  const match = new RegExp(`(?:^|\\s)${name}=(?:"([^"]*)"|(\\S+))`).exec(meta);
  return match ? (match[1] ?? match[2]) : undefined;
}

/** `7-13,15` → [7, …, 13, 15]. */
function lineNumbers(spec: string | undefined, count: number): number[] {
  if (spec === undefined) return Array.from({ length: count }, (_, i) => i + 1);
  const numbers = spec.split(",").flatMap((part) => {
    const [a, b = a] = part.split("-").map(Number);
    if (!Number.isInteger(a) || !Number.isInteger(b) || b! < a!) return [NaN];
    return Array.from({ length: b! - a! + 1 }, (_, i) => a! + i);
  });
  if (numbers.some(Number.isNaN) || numbers.length !== count) {
    throw new DocsBuildError(
      `code block lines=${spec}: names ${numbers.length} line(s) for a block of ${count}`,
    );
  }
  return numbers;
}

function span(className: string, children: ElementContent[]): Element {
  return {
    type: "element",
    tagName: "span",
    properties: { className: [className] },
    children,
  };
}

function text(value: string): ElementContent {
  return { type: "text", value };
}

/** The placeholder a page writes where the reader's GitHub login goes. */
export const GITHUB_USERNAME = "<github-username>";

function marker(children: ElementContent[]): Element {
  return {
    type: "element",
    tagName: "span",
    properties: { dataGithubUsername: "" },
    children,
  };
}

/** Plain text, with each `<github-username>` in it marked. */
function markedText(value: string): ElementContent[] {
  return value
    .split(GITHUB_USERNAME)
    .flatMap((part, i): ElementContent[] => [
      ...(i > 0 ? [marker([text(GITHUB_USERNAME)])] : []),
      ...(part ? [text(part)] : []),
    ]);
}

function prompt(cwd: string | undefined, branch: string | undefined): Element {
  const parts: ElementContent[] = [];
  if (cwd) parts.push(span("docs-prompt-cwd", [text(cwd)]));
  if (branch) {
    parts.push(span("docs-prompt-git", [text(" "), ...markedText(branch)]));
  }
  parts.push(span("docs-prompt-arrow", [text(cwd || branch ? " ❯ " : "❯ ")]));
  const el = span("docs-prompt", parts);
  el.properties.ariaHidden = "true";
  return el;
}

function cdTo(cwd: string | undefined, arg: string): string {
  if (!arg || arg === "~") return "~";
  if (arg.startsWith("~") || arg.startsWith("/")) return arg.replace(/\/$/, "");
  let dir = cwd ?? ".";
  for (const part of arg.split("/")) {
    if (!part || part === ".") continue;
    dir = part === ".." ? dir.replace(/\/[^/]*$/, "") || "~" : `${dir}/${part}`;
  }
  return dir;
}

function textOf(node: ElementContent): string {
  if (node.type === "text") return node.value;
  if (node.type === "element") return node.children.map(textOf).join("");
  return "";
}

/** Shiki's own elements carry `class` as a string; this package's carry
 * `className`. Either way, the element's classes as a list. */
function classesOf(el: Element): string[] {
  const value = el.properties.className ?? el.properties["class"];
  if (Array.isArray(value)) return value.map(String);
  return typeof value === "string" ? value.split(/\s+/).filter(Boolean) : [];
}

function addClass(el: Element, className: string): void {
  const classes = classesOf(el);
  delete el.properties["class"];
  el.properties.className = [...classes, className];
}

/**
 * The branch a `git switch`/`checkout` lands on. `-c`/`-C`/`--create`/
 * `--force-create` (and `-b`/`-B`) name a new branch, whose start point, if
 * any, follows it; otherwise the last word that isn't a flag is the target.
 */
function switchTarget(args: string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    const long = /^--(?:create|force-create)=(.+)$/.exec(arg);
    if (long) return long[1];
    if (/^(?:-[cCbB]|--create|--force-create)$/.test(arg)) {
      const name = args[i + 1];
      if (name && !name.startsWith("-")) return name;
    }
    const attached = /^-[cCbB](.+)$/.exec(arg);
    if (attached) return attached[1];
  }
  return args.filter((w) => !w.startsWith("-")).pop();
}

/**
 * Wraps every `<github-username>` in a line in one `<span data-github-username>`,
 * however the highlighter split it into tokens: the tokens are cut at the
 * placeholder's edges, then the ones inside are gathered under the wrapper.
 * The platform swaps the wrapper's text for the reader's GitHub login.
 */
function markPlaceholders(line: Element): void {
  const whole = textOf(line);
  if (!whole.includes(GITHUB_USERNAME)) return;

  const cuts = new Set<number>();
  for (
    let at = whole.indexOf(GITHUB_USERNAME);
    at !== -1;
    at = whole.indexOf(GITHUB_USERNAME, at + GITHUB_USERNAME.length)
  ) {
    cuts.add(at);
    cuts.add(at + GITHUB_USERNAME.length);
  }

  // Split tokens that straddle a cut.
  const pieces: { node: ElementContent; from: number; to: number }[] = [];
  let offset = 0;
  for (const node of line.children) {
    const value = textOf(node);
    const inside = [...cuts].filter(
      (c) => c > offset && c < offset + value.length,
    );
    if (
      inside.length === 0 ||
      (node.type === "element" && !isPlainToken(node))
    ) {
      pieces.push({ node, from: offset, to: offset + value.length });
    } else {
      const bounds = [
        offset,
        ...inside.sort((a, b) => a - b),
        offset + value.length,
      ];
      for (let i = 0; i < bounds.length - 1; i++) {
        const part = value.slice(bounds[i]! - offset, bounds[i + 1]! - offset);
        pieces.push({
          node:
            node.type === "element"
              ? { ...node, children: [text(part)] }
              : text(part),
          from: bounds[i]!,
          to: bounds[i + 1]!,
        });
      }
    }
    offset += value.length;
  }

  const out: ElementContent[] = [];
  let group: ElementContent[] | null = null;
  let end = 0;
  for (const piece of pieces) {
    const start = piece.from;
    if (
      !group &&
      [...cuts].includes(start) &&
      whole.startsWith(GITHUB_USERNAME, start)
    ) {
      group = [];
      end = start + GITHUB_USERNAME.length;
      out.push(marker(group));
    }
    if (group && piece.from < end) group.push(piece.node);
    else out.push(piece.node);
    if (group && piece.to >= end) group = null;
  }
  line.children = out;
}

/** A Shiki token: an element holding nothing but text. */
function isPlainToken(el: Element): boolean {
  return el.children.every((child) => child.type === "text");
}

/** Prompts, annotations and the idle line, per `shell.ts` in the slides. */
function decorateShell(
  code: Element,
  lines: Element[],
  start: { cwd?: string; branch?: string },
): void {
  let { cwd, branch } = start;
  const clones = new Map<string, string>();
  let continues = false;

  for (const line of lines) {
    const raw = textOf(line);
    const trimmed = raw.trim();
    if (continues) {
      addClass(line, "docs-shell-cont");
      continues = raw.trimEnd().endsWith("\\");
      continue;
    }
    if (!trimmed) continue;
    if (trimmed.startsWith("#")) {
      addClass(line, "docs-shell-comment");
      continue;
    }
    line.children.unshift(prompt(cwd, branch));
    continues = raw.trimEnd().endsWith("\\");

    const words = trimmed.replace(/\s+#.*$/, "").split(/\s+/);
    const clone = /^(?:gh repo clone|git clone)\s+(\S+)(?:\s+(\S+))?/.exec(
      trimmed,
    );
    if (clone) {
      const name =
        clone[2] ??
        clone[1]!
          .replace(/\.git$/, "")
          .split("/")
          .pop()!;
      clones.set(cdTo(cwd, name), "main");
    } else if (words[0] === "cd") {
      cwd = cdTo(cwd, words[1] ?? "~");
      branch = clones.get(cwd) ?? (cwd === "~" ? undefined : branch);
    } else if (
      words[0] === "git" &&
      (words[1] === "switch" || words[1] === "checkout")
    ) {
      const target = switchTarget(words.slice(2));
      if (target) branch = target;
    }
  }

  const idle = span("line", [
    prompt(cwd, branch),
    span("docs-shell-cursor", []),
  ]);
  addClass(idle, "docs-shell-idle");
  idle.properties.ariaHidden = "true";
  code.children.push(text("\n"), idle);
}

const GITHUB_ICON: Element = {
  type: "element",
  tagName: "svg",
  properties: {
    xmlns: "http://www.w3.org/2000/svg",
    viewBox: "0 0 256 256",
    width: "14",
    height: "14",
    fill: "currentColor",
    ariaHidden: "true",
  },
  children: [
    {
      type: "element",
      tagName: "path",
      properties: {
        // Phosphor's "github-logo", regular weight.
        d: "M208.31,75.68A59.78,59.78,0,0,0,202.93,28,8,8,0,0,0,196,24a59.75,59.75,0,0,0-48,24H124A59.75,59.75,0,0,0,76,24a8,8,0,0,0-6.93,4,59.78,59.78,0,0,0-5.38,47.68A58.14,58.14,0,0,0,56,104v8a56.06,56.06,0,0,0,48.44,55.47A39.8,39.8,0,0,0,96,192v8H72a24,24,0,0,1-24-24A40,40,0,0,0,8,136a8,8,0,0,0,0,16,24,24,0,0,1,24,24,40,40,0,0,0,40,40H96v16a8,8,0,0,0,16,0V192a24,24,0,0,1,48,0v40a8,8,0,0,0,16,0V192a39.8,39.8,0,0,0-8.44-24.53A56.06,56.06,0,0,0,216,112v-8A58.14,58.14,0,0,0,208.31,75.68ZM200,112a40,40,0,0,1-40,40H112a40,40,0,0,1-40-40v-8a41.74,41.74,0,0,1,6.9-22.48A8,8,0,0,0,80,73.83a43.81,43.81,0,0,1,.79-33.58,43.88,43.88,0,0,1,32.32,20.06A8,8,0,0,0,119.82,64h32.35a8,8,0,0,0,6.74-3.69,43.87,43.87,0,0,1,32.32-20.06A43.81,43.81,0,0,1,192,73.83a8.09,8.09,0,0,0,1,7.65A41.72,41.72,0,0,1,200,104Z",
      },
      children: [],
    },
  ],
};

/** Every link to the workshops extension starts here. */
export const VSCODE_LINK_PREFIX = "vscode://devdogsuga.workshops/";

/** The fence's `vscode=` link, checked, or undefined when it names none. */
export function vscodeLink(
  meta: string,
  file: string | undefined,
): string | undefined {
  const uri = metaAttribute(meta, "vscode");
  if (uri === undefined) return undefined;
  if (
    !uri.startsWith(VSCODE_LINK_PREFIX) ||
    uri.length === VSCODE_LINK_PREFIX.length
  ) {
    throw new DocsBuildError(
      `code block${file ? ` ${file}` : ""}: vscode=${uri} isn't a ${VSCODE_LINK_PREFIX}review?… or …open?… link`,
    );
  }
  return uri;
}

const VSCODE_ICON: Element = {
  type: "element",
  tagName: "svg",
  properties: {
    xmlns: "http://www.w3.org/2000/svg",
    viewBox: "0 0 24 24",
    width: "14",
    height: "14",
    fill: "currentColor",
    ariaHidden: "true",
  },
  children: [
    {
      type: "element",
      tagName: "path",
      properties: {
        // Simple Icons' "Visual Studio Code".
        d: "M23.15 2.587L18.21.21a1.494 1.494 0 0 0-1.705.29l-9.46 8.63-4.12-3.128a.999.999 0 0 0-1.276.057L.327 7.261A1 1 0 0 0 .326 8.74L3.899 12 .326 15.26a1 1 0 0 0 .001 1.479L1.65 17.94a.999.999 0 0 0 1.276.057l4.12-3.128 9.46 8.63a1.492 1.492 0 0 0 1.704.29l4.942-2.377A1.5 1.5 0 0 0 24 20.06V3.939a1.5 1.5 0 0 0-.85-1.352zm-5.146 14.861L10.826 12l7.178-5.448v10.896z",
      },
      children: [],
    },
  ],
};

export const COPY_ICON: Element = {
  type: "element",
  tagName: "svg",
  properties: {
    xmlns: "http://www.w3.org/2000/svg",
    viewBox: "0 0 256 256",
    width: "14",
    height: "14",
    fill: "currentColor",
    ariaHidden: "true",
  },
  children: [
    {
      type: "element",
      tagName: "path",
      properties: {
        // Phosphor's "copy", regular weight.
        d: "M216,32H88a8,8,0,0,0-8,8V80H40a8,8,0,0,0-8,8V216a8,8,0,0,0,8,8H168a8,8,0,0,0,8-8V176h40a8,8,0,0,0,8-8V40A8,8,0,0,0,216,32ZM160,208H48V96H160Zm48-48H176V88a8,8,0,0,0-8-8H96V48H208Z",
      },
      children: [],
    },
  ],
};

export function docsCodeBlocks(): ShikiTransformer {
  return {
    name: "docs-code-blocks",
    code(code) {
      const meta = this.options.meta?.__raw ?? "";
      const lines = code.children.filter(
        (node): node is Element =>
          node.type === "element" && classesOf(node).includes("line"),
      );
      lines.forEach(markPlaceholders);
      if (SHELL_LANGS.has(this.options.lang)) {
        decorateShell(code, lines, {
          cwd: metaAttribute(meta, "cwd"),
          branch: metaAttribute(meta, "branch"),
        });
        return;
      }
      const numbers = lineNumbers(metaAttribute(meta, "lines"), lines.length);
      lines.forEach((line, i) => {
        line.properties["dataLine"] = String(numbers[i]);
        if (i > 0 && numbers[i] !== numbers[i - 1]! + 1) {
          // A separator row where the excerpt skips lines of the file.
          const gap = span("line", []);
          addClass(gap, "docs-code-gap");
          gap.properties.ariaHidden = "true";
          code.children.splice(code.children.indexOf(line), 0, gap, text("\n"));
        }
      });
    },
    root(root: Root) {
      const meta = this.options.meta?.__raw ?? "";
      const lang = this.options.lang;
      const terminal = SHELL_LANGS.has(lang);
      const file = metaAttribute(meta, "file");
      const title =
        file ??
        metaAttribute(meta, "title") ??
        (terminal ? "Terminal" : (LANG_NAMES[lang] ?? lang));

      const tab = span("docs-code-tab", [
        codeIconSvg(terminal ? "terminal" : codeIcon(lang, file)),
        text(title),
      ]);
      const copy: Element = {
        type: "element",
        tagName: "button",
        properties: {
          type: "button",
          className: ["docs-code-copy"],
          dataCopy: "",
          ariaLabel: terminal ? "Copy commands" : "Copy code",
        },
        children: [COPY_ICON, span("docs-code-copy-label", [text("Copy")])],
      };
      const href = metaAttribute(meta, "href");
      const link: Element | null = href
        ? {
            type: "element",
            tagName: "a",
            properties: {
              className: ["docs-code-link"],
              href,
              target: "_blank",
              rel: ["noopener", "noreferrer"],
              ariaLabel: "View on GitHub",
            },
            children: [
              GITHUB_ICON,
              span("docs-code-link-label", [text("GitHub")]),
            ],
          }
        : null;
      const vscodeUri = terminal ? undefined : vscodeLink(meta, file);
      const isOpen = vscodeUri?.startsWith(`${VSCODE_LINK_PREFIX}open`);
      const vscode: Element | null = vscodeUri
        ? {
            type: "element",
            tagName: "a",
            properties: {
              className: ["docs-code-vscode"],
              href: vscodeUri,
              ariaLabel: isOpen ? "Open in VS Code" : "Review in VS Code",
              title: isOpen ? "Open in VS Code" : "Review in VS Code",
            },
            children: [VSCODE_ICON],
          }
        : null;
      root.children = [
        {
          type: "element",
          tagName: "figure",
          properties: {
            className: ["docs-code"],
            dataKind: terminal ? "terminal" : "code",
          },
          children: [
            {
              type: "element",
              tagName: "div",
              properties: { className: ["docs-code-bar"] },
              children: [
                tab,
                {
                  type: "element",
                  tagName: "div",
                  properties: { className: ["docs-code-actions"] },
                  children: [
                    ...(vscode ? [vscode] : []),
                    ...(link ? [link] : []),
                    copy,
                  ],
                },
              ],
            },
            ...(root.children as ElementContent[]),
          ],
        },
      ];
    },
  };
}

/**
 * Keeps each fence's info string within Shiki's reach. `rehype-raw` rebuilds
 * the tree before Shiki runs and drops the `data.meta` remark put on the code
 * element; a `metastring` property survives, and `@shikijs/rehype` reads it.
 */
export function remarkKeepMeta() {
  return (tree: MdastRoot) => {
    const visit = (node: MdastNodes) => {
      if (node.type === "code" && node.meta) {
        node.data = {
          ...node.data,
          hProperties: { ...node.data?.hProperties, metastring: node.meta },
        };
      }
      if ("children" in node) node.children.forEach(visit);
    };
    visit(tree);
  };
}
