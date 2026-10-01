/**
 * Variants: the parts of a page that differ by reader, resolved from
 * `remark-directive` syntax.
 *
 * Two kinds of difference, settled at two different times:
 *
 * - **Project**, at build time. A `_shared` page is emitted once per project
 *   it mounts into, so `:::only{project="platform"}` keeps its content in the
 *   platform copy and drops it everywhere else. Nothing about it reaches the
 *   browser.
 * - **Setup** (`os`, `supabase`), in the browser. The same copy of a page
 *   serves a macOS reader and a WSL2 reader, so every variant ships and the
 *   page shows the one matching the reader's choice. `:::tabs{group="os"}`
 *   renders a tab strip plus one panel per `::tab`, and
 *   `:::only{os="windows"}` renders a block that is hidden unless the reader
 *   picked that value. The choice itself lives in the platform, as a
 *   `data-<group>` attribute on `<html>`, and CSS does the hiding, so the
 *   right variant is on screen before any script runs.
 *
 * ```md
 * :::tabs{group="os"}
 * ::tab{value="macos"}
 * Install Homebrew first.
 * ::tab{value="linux wsl"}
 * Use your distribution's package manager.
 * :::
 * ```
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
import type { ContainerDirective, TextDirective } from "mdast-util-directive";
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

/** `:::tabs{group=…}`, split on its `::tab{value=…}` markers. */
function tabsFromDirective(
  node: ContainerDirective,
  ctx: VariantContext,
): RootContent[] {
  const group = node.attributes?.["group"];
  if (!group || !isGroup(group)) {
    fail(
      ctx,
      node,
      `:::tabs needs group="${Object.keys(VARIANT_GROUPS).join('" or group="')}"`,
    );
  }

  const tabs: Tab[] = [];
  for (const child of node.children as RootContent[]) {
    if (child.type === "leafDirective" && child.name === "tab") {
      tabs.push({
        values: readValues(group, child.attributes?.["value"], ctx, child),
        children: [],
      });
    } else if (tabs.length === 0) {
      fail(ctx, child, ":::tabs must open with a ::tab{value=…} marker");
    } else {
      tabs.at(-1)!.children.push(child);
    }
  }
  if (tabs.length === 0) fail(ctx, node, ":::tabs has no ::tab markers");

  return renderTabs(group, resolveChildrenOf(tabs, ctx), ctx, node);
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

/** `:::only{project=… os=… supabase=…}`. */
function resolveOnly(
  node: ContainerDirective,
  ctx: VariantContext,
): RootContent[] {
  const attributes = node.attributes ?? {};
  for (const key of Object.keys(attributes)) {
    if (key !== "project" && !isGroup(key)) {
      fail(ctx, node, `:::only takes project=, os= or supabase=, not ${key}=`);
    }
  }

  if (attributes["project"] !== undefined) {
    const projects = splitList(attributes["project"]);
    if (projects.length === 0) fail(ctx, node, ":::only names no project");
    for (const project of projects) {
      if (!ctx.projects.includes(project)) {
        fail(
          ctx,
          node,
          `:::only names unknown project "${project}" — known projects are ${ctx.projects.join(", ")}`,
        );
      }
    }
    if (!projects.includes(ctx.project)) return [];
  }

  let children = resolveList(node.children, ctx);

  for (const group of Object.keys(VARIANT_GROUPS) as VariantGroup[]) {
    if (attributes[group] === undefined) continue;
    const offered = available(group, ctx);
    const values = readValues(group, attributes[group], ctx, node).filter(
      (value) => offered.includes(value),
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

    if (node.type === "containerDirective") {
      if (node.name === "tabs") {
        out.push(...tabsFromDirective(node, ctx));
      } else if (node.name === "only") {
        out.push(...resolveOnly(node, ctx));
      } else if (node.name === "copyable") {
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
          `unknown directive :::${node.name} — this compiler knows :::tabs, :::only and :::copyable`,
        );
      }
      continue;
    }

    if (node.type === "leafDirective") {
      fail(
        ctx,
        node,
        node.name === "tab"
          ? "::tab outside a :::tabs block"
          : `unknown directive ::${node.name}`,
      );
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
