/**
 * Variants: the parts of a page that differ by reader, written as `<details>`
 * elements so the same Markdown reads sensibly on github.com, where a
 * `<details>` renders as a labelled collapsible and its `data-*` attributes
 * are dropped. This module reads the source, so it sees them.
 *
 * Two kinds of difference, settled at two different times:
 *
 * - **Project**, at build time. A `_shared` page is emitted once per project
 *   it mounts into, so `<details data-project="platform">` keeps its content
 *   in the platform copy and drops it everywhere else. Nothing about it
 *   reaches the browser.
 * - **Setup** (`os`, `supabase`), in the browser. The same copy of a page
 *   serves a macOS reader and a WSL2 reader, so every variant ships and the
 *   page shows the one matching the reader's choice. A run of consecutive
 *   `<details name="os" data-value="…">` elements is a tab group: a strip plus
 *   one panel per element. `<details data-os="windows">` renders a block that
 *   is hidden unless the reader picked that value. The choice itself lives in
 *   the platform, as a `data-<group>` attribute on `<html>`, and CSS does the
 *   hiding, so the right variant is on screen before any script runs.
 *
 * ```md
 * <details name="os" data-value="macos">
 * <summary>macOS</summary>
 *
 * Install Homebrew first.
 *
 * </details>
 *
 * <details name="os" data-value="linux wsl">
 * <summary>Linux and Windows (WSL2)</summary>
 *
 * Use your distribution's package manager.
 *
 * </details>
 * ```
 *
 * Blank lines around the `<summary>` line and the closing tag are required:
 * they are what makes both GitHub and this parser read the body as Markdown
 * rather than as raw HTML. The tab strip is built from the group's own value
 * labels (one button per value the project offers), not from the `<summary>`,
 * which is the label GitHub shows. A plain `<details>` carrying none of
 * `name`, `data-project`, `data-os` or `data-supabase` is an ordinary
 * collapsible and is left alone.
 *
 * A run of adjacent code blocks can say the same thing in their info string,
 * which is shorter for the common case of one command per platform:
 *
 * ````md
 * ```bash os=macos
 * brew install fnm
 * ```
 * ```bash os="linux wsl"
 * curl -fsSL https://fnm.vercel.app/install | bash
 * ```
 * ````
 *
 * Each value a group can take in a project has to be covered exactly once, or
 * the build fails. A reader on a platform the page forgot would otherwise get
 * an empty panel, and nothing short of that reader reporting it would say so.
 * `os` is covered per project: the `windows` value (native Windows, as opposed
 * to `wsl`) only exists in a project whose own `index.md` lists it under
 * `os:`, and a tab offering only `windows` is dropped from every other
 * project's copy of the page.
 *
 * Headings are refused anywhere a reader might not see them. The table of
 * contents is built from every heading on the page, so a heading inside a
 * hidden panel would be a TOC entry leading nowhere.
 */
import type {
  Code,
  Heading,
  Node,
  Parent,
  PhrasingContent,
  RootContent,
} from "mdast";
import type { TextDirective } from "mdast-util-directive";
import { visit } from "unist-util-visit";
import { DocsBuildError } from "./errors.js";
import { COPYABLE_CLASS } from "./tables.js";

/** A setup axis the reader picks in the browser. */
export type VariantGroup = "os" | "supabase";

interface GroupDefinition {
  /** Every value, in the order the tab strip shows them. */
  values: readonly string[];
  labels: Readonly<Record<string, string>>;
}

export const VARIANT_GROUPS: Readonly<Record<VariantGroup, GroupDefinition>> = {
  os: {
    values: ["macos", "linux", "wsl", "windows"],
    labels: {
      macos: "macOS",
      linux: "Linux",
      wsl: "Windows (WSL2)",
      windows: "Windows (native)",
    },
  },
  supabase: {
    values: ["hosted", "local"],
    labels: { hosted: "Hosted", local: "Local (Docker)" },
  },
};

/**
 * The platforms a project supports when its `index.md` does not say. Native
 * Windows is opt-in, because only a project whose toolchain runs there
 * (study-group-finder's Flutter) should offer it.
 */
export const DEFAULT_OS: readonly string[] = ["macos", "linux", "wsl"];

/** Everything resolving one emitted copy of a page needs to know. */
export interface VariantContext {
  /** The project this copy is emitted into. */
  project: string;
  /** Every project slug, to catch a typo in `only{project=…}`. */
  projects: readonly string[];
  /** The `os` values this project supports, from its `index.md`. */
  os: readonly string[];
  /** For error messages: the source file, `.md` included. */
  file: string;
}

function isGroup(name: string): name is VariantGroup {
  return Object.hasOwn(VARIANT_GROUPS, name);
}

/** The values a group can take in this copy of the page. */
function available(group: VariantGroup, ctx: VariantContext): string[] {
  return group === "os" ? [...ctx.os] : [...VARIANT_GROUPS[group].values];
}

/** `"macos linux"` or `"macos,linux"` → `["macos", "linux"]`. */
function splitList(raw: string | null | undefined): string[] {
  return (raw ?? "").split(/[\s,]+/).filter((value) => value !== "");
}

function fail(ctx: VariantContext, node: Node, message: string): never {
  const line = node.position?.start.line;
  throw new DocsBuildError(
    `${ctx.file}${line === undefined ? "" : `:${line}`} (in ${ctx.project}): ${message}`,
  );
}

/** Values named on a directive, each checked against its group. */
function readValues(
  group: VariantGroup,
  raw: string | null | undefined,
  ctx: VariantContext,
  node: Node,
): string[] {
  const values = splitList(raw);
  if (values.length === 0) {
    fail(ctx, node, `names no ${group} value`);
  }
  for (const value of values) {
    if (!VARIANT_GROUPS[group].values.includes(value)) {
      fail(
        ctx,
        node,
        `unknown ${group} value "${value}" — expected one of ${VARIANT_GROUPS[group].values.join(", ")}`,
      );
    }
  }
  return values;
}

function refuseHeadings(nodes: RootContent[], ctx: VariantContext): void {
  for (const node of nodes) {
    visit(node, "heading", (heading: Heading) => {
      fail(
        ctx,
        heading,
        "a heading inside a tab or an `only` block — the table of contents would point at something the reader may not see; move it above the block",
      );
    });
  }
}

/** One tab before rendering: which values it serves, and its content. */
interface Tab {
  values: string[];
  children: RootContent[];
}

/**
 * A tab strip and its panels, as mdast nodes carrying the hast they become.
 *
 * The strip lists every value the project offers rather than one button per
 * tab, because a tab can serve several values ("linux wsl") and the reader
 * picks a platform, not a tab. Picking one sets the same choice the sidebar's
 * switcher sets; the platform's CSS then shows the one panel whose
 * `data-values` includes it.
 */
function renderTabs(
  group: VariantGroup,
  tabs: Tab[],
  ctx: VariantContext,
  node: Node,
): RootContent[] {
  const offered = available(group, ctx);
  const kept = tabs
    .map((tab) => ({
      ...tab,
      values: tab.values.filter((value) => offered.includes(value)),
    }))
    .filter((tab) => tab.values.length > 0);

  const seen = new Set<string>();
  for (const tab of kept) {
    for (const value of tab.values) {
      if (seen.has(value)) {
        fail(ctx, node, `two tabs both cover ${group} "${value}"`);
      }
      seen.add(value);
    }
  }
  const missing = offered.filter((value) => !seen.has(value));
  if (missing.length > 0) {
    fail(
      ctx,
      node,
      `the ${group} tabs have nothing for ${missing
        .map((value) => VARIANT_GROUPS[group].labels[value])
        .join(", ")} — add a tab, or widen an existing one's value list`,
    );
  }

  for (const tab of kept) refuseHeadings(tab.children, ctx);

  // One tab serving every value is not a choice, so it gets no chrome.
  if (kept.length === 1) return kept[0]!.children;

  const strip = {
    type: "variantTabList",
    data: {
      hName: "div",
      hProperties: {
        className: ["docs-tablist"],
        role: "tablist",
        dataGroup: group,
      },
      hChildren: offered.map((value) => ({
        type: "element" as const,
        tagName: "button",
        properties: {
          type: "button",
          role: "tab",
          className: ["docs-tab"],
          dataGroup: group,
          dataValue: value,
        },
        children: [
          {
            type: "text" as const,
            value: VARIANT_GROUPS[group].labels[value]!,
          },
        ],
      })),
    },
  };

  const panels = kept.map((tab) => ({
    type: "variantPanel",
    data: {
      hName: "div",
      hProperties: {
        className: ["docs-tabpanel"],
        role: "tabpanel",
        dataGroup: group,
        dataValues: tab.values.join(" "),
      },
    },
    children: tab.children,
  }));

  return [
    {
      type: "variantTabs",
      data: {
        hName: "div",
        hProperties: { className: ["docs-tabs"], dataGroup: group },
      },
      children: [strip, ...panels],
    } as unknown as RootContent,
  ];
}

/** Tab content can hold its own `only` blocks; resolve those first. */
function resolveChildrenOf(tabs: Tab[], ctx: VariantContext): Tab[] {
  return tabs.map((tab) => ({
    ...tab,
    children: resolveList(tab.children, ctx),
  }));
}

/** The `os=…`/`supabase=…` shorthand in a code block's info string. */
function fenceVariant(
  node: RootContent,
): { group: VariantGroup; raw: string; meta: string | null } | null {
  if (node.type !== "code" || !node.meta) return null;
  const match = /(?:^|\s)(os|supabase)=(?:"([^"]*)"|(\S+))/.exec(node.meta);
  if (!match) return null;
  const meta = (
    node.meta.slice(0, match.index) +
    node.meta.slice(match.index + match[0].length)
  ).trim();
  return {
    group: match[1] as VariantGroup,
    raw: match[2] ?? match[3] ?? "",
    meta: meta === "" ? null : meta,
  };
}

/** The attributes that make a `<details>` a variant rather than a collapsible. */
const VARIANT_ATTRIBUTES = [
  "name",
  "data-value",
  "data-project",
  "data-os",
  "data-supabase",
] as const;

/** An opening `<details …>` tag, attributes captured. */
const DETAILS_TAG = /^<details((?:\s+[^\s>="']+(?:="[^"]*")?)*)\s*>/;

/** An opening variant `<details>`: its attributes, as the author wrote them. */
interface VariantOpen {
  attributes: Record<string, string>;
}

function parseAttributes(raw: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const match of raw.matchAll(/([^\s="']+)(?:="([^"]*)")?/g)) {
    attributes[match[1]!] = match[2] ?? "";
  }
  return attributes;
}

/**
 * Reads a node as the opening of a variant `<details>`, or null when it is
 * anything else, a plain collapsible included.
 *
 * The opening is the one HTML block that runs from `<details …>` to the first
 * blank line, so it holds the tag and the `<summary>` and nothing more; body
 * text that follows without a blank line is part of the same HTML block, which
 * is exactly the mistake worth failing on, because GitHub would render it as
 * raw HTML too.
 */
function variantOpen(
  node: RootContent,
  ctx: VariantContext,
): VariantOpen | null {
  if (node.type !== "html") return null;
  const value = node.value.trim();
  const tag = DETAILS_TAG.exec(value);
  if (tag === null) return null;

  const attributes = parseAttributes(tag[1]!);
  const names = Object.keys(attributes);
  if (
    !names.some((key) =>
      (VARIANT_ATTRIBUTES as readonly string[]).includes(key),
    )
  ) {
    return null;
  }
  for (const key of names) {
    if (!(VARIANT_ATTRIBUTES as readonly string[]).includes(key)) {
      fail(
        ctx,
        node,
        `<details> takes ${VARIANT_ATTRIBUTES.join(", ")}, not ${key}`,
      );
    }
  }

  const rest = value.slice(tag[0].length).trim();
  const summary = /^<summary>([\s\S]*?)<\/summary>$/.exec(rest);
  if (summary === null || summary[1]!.trim() === "") {
    fail(
      ctx,
      node,
      "a variant <details> opens with its <summary> label and then a blank line — GitHub shows the summary, and the body has to be Markdown",
    );
  }
  return { attributes };
}

function countOf(value: string, pattern: RegExp): number {
  return [...value.matchAll(pattern)].length;
}

/**
 * The children of the `<details>` opened at `nodes[start]` and the index of
 * its closing `</details>`. Other `<details>` inside (variants or plain
 * collapsibles) are matched in pairs, so nesting works.
 */
function detailsBody(
  nodes: RootContent[],
  start: number,
  ctx: VariantContext,
): { children: RootContent[]; end: number } {
  let depth = 1;
  for (let j = start + 1; j < nodes.length; j++) {
    const node = nodes[j]!;
    if (node.type !== "html") continue;
    depth +=
      countOf(node.value, /<details\b/g) -
      countOf(node.value, /<\/details\s*>/g);
    if (depth > 0) continue;
    if (node.value.trim() !== "</details>") {
      fail(
        ctx,
        node,
        "a variant <details> closes with </details> on its own line, after a blank line",
      );
    }
    return { children: nodes.slice(start + 1, j), end: j };
  }
  return fail(ctx, nodes[start]!, "this <details> is never closed");
}

/** A run of consecutive `<details name=… data-value=…>`: one tab group. */
function tabsFromDetails(
  nodes: RootContent[],
  start: number,
  open: VariantOpen,
  ctx: VariantContext,
): { out: RootContent[]; end: number } {
  const group = open.attributes["name"]!;
  if (!isGroup(group)) {
    fail(
      ctx,
      nodes[start]!,
      `<details name="${group}"> — name must be "${Object.keys(VARIANT_GROUPS).join('" or "')}"`,
    );
  }

  const tabs: Tab[] = [];
  let at = start;
  let current: VariantOpen | null = open;
  while (current?.attributes["name"] === group) {
    const node = nodes[at]!;
    for (const key of ["data-project", "data-os", "data-supabase"]) {
      if (current.attributes[key] !== undefined) {
        fail(ctx, node, `a tab takes data-value, not ${key}`);
      }
    }
    const { children, end } = detailsBody(nodes, at, ctx);
    tabs.push({
      values: readValues(group, current.attributes["data-value"], ctx, node),
      children,
    });
    at = end + 1;
    current = at < nodes.length ? variantOpen(nodes[at]!, ctx) : null;
  }

  return {
    out: renderTabs(group, resolveChildrenOf(tabs, ctx), ctx, nodes[start]!),
    end: at - 1,
  };
}

/** `<details data-project=… data-os=… data-supabase=…>`. */
function resolveOnly(
  attributes: Record<string, string>,
  rawChildren: RootContent[],
  ctx: VariantContext,
  node: Node,
): RootContent[] {
  if (attributes["data-value"] !== undefined) {
    fail(ctx, node, "data-value belongs on a <details name=…> tab");
  }

  if (attributes["data-project"] !== undefined) {
    const projects = splitList(attributes["data-project"]);
    if (projects.length === 0) fail(ctx, node, "data-project names no project");
    for (const project of projects) {
      if (!ctx.projects.includes(project)) {
        fail(
          ctx,
          node,
          `data-project names unknown project "${project}" — known projects are ${ctx.projects.join(", ")}`,
        );
      }
    }
    if (!projects.includes(ctx.project)) return [];
  }

  let children = resolveList(rawChildren, ctx);

  for (const group of Object.keys(VARIANT_GROUPS) as VariantGroup[]) {
    const raw = attributes[`data-${group}`];
    if (raw === undefined) continue;
    const offered = available(group, ctx);
    const values = readValues(group, raw, ctx, node).filter((value) =>
      offered.includes(value),
    );
    if (values.length === 0) return [];
    if (values.length === offered.length) continue;

    refuseHeadings(children, ctx);
    children = [
      {
        type: "variantOnly",
        data: {
          hName: "div",
          hProperties: {
            className: ["docs-only"],
            dataGroup: group,
            dataValues: values.join(" "),
          },
        },
        children,
      } as unknown as RootContent,
    ];
  }

  return children;
}

/**
 * A text directive nobody meant. `remark-directive` reads any `:word` as one,
 * so "see the `a:b` note" survives but "ratio 3:2, host:port" becomes a
 * directive named `port`. Everything this module handles is a block
 * directive, so a text directive is always prose to put back.
 */
function restoreText(node: TextDirective): PhrasingContent[] {
  const restored: PhrasingContent[] = [
    { type: "text", value: `:${node.name}` },
  ];
  if (node.children.length > 0) {
    restored.push({ type: "text", value: "[" }, ...node.children, {
      type: "text",
      value: "]",
    });
  }
  return restored;
}

/** Resolves one list of siblings, returning its replacement. */
function resolveList(nodes: RootContent[], ctx: VariantContext): RootContent[] {
  const out: RootContent[] = [];

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!;

    const fence = fenceVariant(node);
    if (fence) {
      // Gather the whole run of adjacent code blocks in the same group.
      const run: Tab[] = [];
      let j = i;
      for (; j < nodes.length; j++) {
        const next = fenceVariant(nodes[j]!);
        if (next?.group !== fence.group) break;
        const code = nodes[j] as Code;
        run.push({
          values: readValues(next.group, next.raw, ctx, code),
          children: [{ ...code, meta: next.meta }],
        });
      }
      out.push(...renderTabs(fence.group, run, ctx, node));
      i = j - 1;
      continue;
    }

    const open = variantOpen(node, ctx);
    if (open !== null) {
      if (open.attributes["name"] !== undefined) {
        const tabs = tabsFromDetails(nodes, i, open, ctx);
        out.push(...tabs.out);
        i = tabs.end;
      } else {
        const { children, end } = detailsBody(nodes, i, ctx);
        out.push(...resolveOnly(open.attributes, children, ctx, node));
        i = end;
      }
      continue;
    }

    if (node.type === "containerDirective") {
      if (node.name === "copyable") {
        // Not a variant: a wrapper tables.ts looks for. Kept as a `div` so
        // the tables inside it still know they were marked.
        node.data = {
          hName: "div",
          hProperties: { className: [COPYABLE_CLASS] },
        };
        node.children = resolveChildren(
          node.children,
          ctx,
        ) as typeof node.children;
        out.push(node);
      } else {
        fail(
          ctx,
          node,
          `unknown directive :::${node.name} — this compiler knows :::copyable; tabs and project/os blocks are <details> elements now (see docs/toolkit/infrastructure/docs-system/variants.md)`,
        );
      }
      continue;
    }

    if (node.type === "leafDirective") {
      fail(ctx, node, `unknown directive ::${node.name}`);
    }

    if ("children" in node && Array.isArray(node.children)) {
      const parent = node as Parent;
      parent.children = resolveChildren(parent.children, ctx);
    }
    out.push(node);
  }

  return out;
}

/** Inline content only ever needs its text directives put back. */
function resolveChildren(
  nodes: RootContent[],
  ctx: VariantContext,
): RootContent[] {
  if (!nodes.some((node) => node.type === "textDirective")) {
    return resolveList(nodes, ctx);
  }
  return nodes.flatMap((node) =>
    node.type === "textDirective"
      ? (restoreText(node) as RootContent[])
      : resolveList([node], ctx),
  );
}

/**
 * Resolves every variant in `tree` for one emitted copy, in place. Throws a
 * `DocsBuildError` for anything a reader would otherwise find broken: an
 * uncovered platform, an unknown directive or value, a heading a reader might
 * not see.
 */
export function resolveVariants(tree: Parent, ctx: VariantContext): void {
  tree.children = resolveChildren(tree.children, ctx);
}

/**
 * `resolveVariants` as a unified plugin. The context rides on the file
 * (`file.data.variants`) rather than the plugin's options, so one processor
 * serves every page.
 */
export function remarkVariants() {
  return (tree: Parent, file: { data: Record<string, unknown> }) => {
    const ctx = file.data["variants"] as VariantContext | undefined;
    if (!ctx) throw new Error("remarkVariants: file.data.variants is unset");
    resolveVariants(tree, ctx);
  };
}
