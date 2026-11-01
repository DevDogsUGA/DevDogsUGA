/**
 * Fails the build on author HTML that is not on the allowlist (see
 * `html-policy.ts` for what is, and why).
 *
 * Pages are markdown with raw HTML allowed, and the platform injects the
 * result as-is. It caches that HTML and stamps its CSP nonce onto every
 * `<script>` in it at the edge, so a `<script>` written into a page would be
 * trusted exactly like the site's own. This pass is what makes that safe.
 *
 * Provenance matters: the compiler's own plugins generate elements too (alert
 * callouts with an SVG icon, variant tab strips with buttons, markdown links).
 * Those are not author HTML and must not be held to the author allowlist. So
 * just before `rehype-raw` turns raw HTML strings into elements,
 * `rehypeMarkGenerated` stamps every element that exists already with a
 * per-process secret attribute; after it, any element WITHOUT the stamp came
 * out of an author's raw HTML. The stamp is unguessable, so author HTML can't
 * claim it, and it is removed again here.
 *
 * Nothing is stripped. Elements the author wrote either pass or fail the
 * build. Comments are kept in trusted docs and dropped in untrusted ones.
 */
import type { Element, Root as HastRoot } from "hast";
import type { Root as MdastRoot } from "mdast";

type HastParent = HastRoot | Element;
type Position = Element["position"];
import { visit } from "unist-util-visit";
import rehypeRaw from "rehype-raw";
import { VFile } from "vfile";
import { DocsBuildError } from "./errors.js";
import { metaAttribute } from "./codeblocks.js";
import {
  checkUrl,
  elementProblem,
  normalizeUrl,
  schemeOf,
  generatedElementProblem,
  type ContentTrust,
  type UntrustedAssets,
} from "./html-policy.js";
import type { VariantContext } from "./variants.js";

let stampName: string | undefined;

/**
 * The per-process secret attribute name, made on first use rather than when
 * the module loads: a Worker may not generate random values in global scope.
 * Letters only: hast turns the attribute name back into a property by case.
 */
function stamp(): string {
  stampName ??= `docsGen${[...crypto.getRandomValues(new Uint8Array(12))]
    .map((byte) => String.fromCharCode(97 + (byte % 26)))
    .join("")}`;
  return stampName;
}

/** What `render.ts` hands the sanitizer through `file.data.policy`. */
export interface RenderPolicy {
  trust: ContentTrust;
  /** Untrusted only: where relative references resolve and what they may name. */
  untrusted?: UntrustedAssets;
}

export const TRUSTED_POLICY: RenderPolicy = { trust: "trusted" };

function policyOf(file: VFile): RenderPolicy {
  return (file.data as { policy?: RenderPolicy }).policy ?? TRUSTED_POLICY;
}

/** Stamps every element that exists before `rehype-raw` runs. */
export function rehypeMarkGenerated() {
  return (tree: HastRoot) => {
    visit(tree, "element", (node: Element) => {
      node.properties[stamp()] = "";
    });
  };
}

function isStamped(node: Element): boolean {
  return Object.keys(node.properties).some(
    (name) => name.toLowerCase() === stamp().toLowerCase(),
  );
}

function unstamp(node: Element): void {
  for (const name of Object.keys(node.properties)) {
    if (name.toLowerCase() === stamp().toLowerCase())
      delete node.properties[name];
  }
}

/** Where a problem is, for the message: file and line, plus the project. */
function whereOf(file: VFile, position: Position | undefined): string {
  const ctx = (file.data as { variants?: VariantContext }).variants;
  const line = position?.start.line;
  return ctx
    ? `${ctx.file}${line === undefined ? "" : `:${line}`} (in ${ctx.project})`
    : `page${line === undefined ? "" : `:${line}`}`;
}

function fail(file: VFile, node: Element, problem: string): never {
  throw new DocsBuildError(
    `${whereOf(file, node.position)}: ${problem}. Docs pages can't run script or load other pages' content; the site trusts every element in a page's HTML. Allowed HTML and SVG are listed in packages/docs-kit/src/html-policy.ts.`,
  );
}

/** Checks the page's HTML against the allowlist. Runs right after `rehype-raw`. */
export function rehypeSanitizeHtml() {
  return (tree: HastRoot, file: VFile) => {
    const policy = policyOf(file);
    const url = { trust: policy.trust, untrusted: policy.untrusted };

    const walk = (parent: HastParent, inSvg: boolean): void => {
      for (let i = 0; i < parent.children.length; i++) {
        const node = parent.children[i]!;
        if (node.type === "comment" && policy.trust === "untrusted") {
          parent.children.splice(i--, 1);
          continue;
        }
        if (node.type === "doctype") {
          throw new DocsBuildError(
            `${whereOf(file, node.position)}: a doctype isn't allowed in a docs page`,
          );
        }
        if (node.type !== "element") continue;

        if (isStamped(node)) {
          unstamp(node);
          const problem = generatedElementProblem(
            node.tagName,
            node.properties,
            url,
          );
          if (problem !== null) fail(file, node, problem);
          walk(node, inSvg);
          continue;
        }

        const problem = elementProblem(node.tagName, node.properties, {
          inSvg,
          url,
        });
        if (problem !== null) fail(file, node, problem);
        walk(node, inSvg || node.tagName === "svg");
      }
    };
    walk(tree, false);
  };
}

/**
 * Untrusted docs' external links: `noopener noreferrer nofollow`, so a
 * project's page can't hand the site's window to the destination or borrow
 * the site's reputation for its own SEO. Scheme rules are `checkUrl`'s.
 */
export function rehypeExternalLinks() {
  return (tree: HastRoot, file: VFile) => {
    if (policyOf(file).trust !== "untrusted") return;
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "a") return;
      const href = node.properties.href;
      if (typeof href !== "string") return;
      const scheme = schemeOf(href);
      if (scheme !== "http" && scheme !== "https" && scheme !== "mailto")
        return;
      // Browsers drop tabs and newlines inside a URL; write what they read.
      node.properties.href = normalizeUrl(href);
      node.properties.rel = ["noopener", "noreferrer", "nofollow"];
      delete node.properties.target;
    });
  };
}

/** The prefix an untrusted project's ids and fragment references get. */
export function idPrefixFor(project: string): string {
  return `pd-${project}--`;
}

/** `url(#a)` inside a presentation attribute value, rewritten to `url(#<prefix>a)`. */
function prefixUrlRefs(value: string, prefix: string): string {
  return value.replace(
    /url\(\s*(["']?)#([^)"'\s]*)\1\s*\)/gi,
    (_all, quote: string, id: string) => `url(${quote}#${prefix}${id}${quote})`,
  );
}

/**
 * Untrusted docs: every `id` in the page, the generated ones (headings,
 * footnotes) and an author's SVG ones alike, gets a per-project prefix, and
 * every reference to one is rewritten to match: same-page `#ref` links, SVG
 * `href="#ref"` and `url(#ref)` values, `aria-labelledby`-style id lists, and
 * links to another heading of this project's docs (`/docs/<project>/x#ref`).
 * Without it a page could set `id="location"` or a heading named "Cookie" and
 * shadow a property of `document` or `window` that the site's scripts read
 * (DOM clobbering). Runs right after `rehype-slug` so the heading links
 * `rehype-autolink-headings` builds from the ids come out prefixed already.
 */
export function rehypePrefixIds() {
  return (tree: HastRoot, file: VFile) => {
    const policy = policyOf(file);
    if (policy.trust !== "untrusted" || policy.untrusted === undefined) return;
    const { project } = policy.untrusted;
    const prefix = idPrefixFor(project);
    const home = `/docs/${project}`;

    visit(tree, "element", (node: Element) => {
      const props = node.properties;
      for (const [name, raw] of Object.entries(props)) {
        if (name === "id" && typeof raw === "string") {
          props[name] = prefix + raw;
        } else if (name === "href" && typeof raw === "string") {
          if (raw.startsWith("#")) {
            props[name] = `#${prefix}${raw.slice(1)}`;
          } else if (raw.startsWith(home)) {
            const hash = raw.indexOf("#");
            const head = hash === -1 ? raw : raw.slice(0, hash);
            if (head === home || head.startsWith(`${home}/`)) {
              props[name] =
                hash === -1 ? raw : `${head}#${prefix}${raw.slice(hash + 1)}`;
            }
          }
        } else if (
          (name === "ariaLabelledBy" || name === "ariaDescribedBy") &&
          raw !== undefined &&
          raw !== null
        ) {
          const ids = (Array.isArray(raw) ? raw : String(raw).split(/\s+/))
            .map(String)
            .filter((id) => id !== "");
          props[name] = ids.map((id) => prefix + id);
        } else if (typeof raw === "string") {
          props[name] = prefixUrlRefs(raw, prefix);
        } else if (Array.isArray(raw)) {
          props[name] = raw.map((part) =>
            typeof part === "string" ? prefixUrlRefs(part, prefix) : part,
          );
        }
      }
    });
  };
}

/**
 * Checks a standalone `.svg` asset against the same allowlist as inline SVG.
 * The file is parsed as HTML foreign content (what a browser does with an
 * inline `<svg>`), so a construct the page policy would refuse is refused
 * here too; XML-only features that would need an XML parser (a DOCTYPE with
 * entities, processing instructions, CDATA tricks) are refused outright.
 */
export function checkSvgAsset(text: string, label: string): void {
  if (/<!doctype|<!entity|<\?(?!xml\s)/i.test(text)) {
    throw new DocsBuildError(
      `${label}: SVG files can't contain a DOCTYPE, entities or processing instructions`,
    );
  }
  const body = text.replace(/^﻿?\s*<\?xml[^>]*\?>/i, "").trim();
  const file = new VFile({
    value: body,
    data: {
      variants: { file: label, project: "svg" },
      policy: { trust: "untrusted" } satisfies RenderPolicy,
    },
  });
  const tree: HastRoot = {
    type: "root",
    children: [{ type: "raw", value: body } as never],
  };
  const parsed = rehypeRaw()(tree, file);
  rehypeSanitizeHtml()(parsed, file);

  const elements = parsed.children.filter((c) => c.type === "element");
  const stray = parsed.children.some(
    (c) =>
      c.type !== "element" &&
      c.type !== "comment" &&
      !(c.type === "text" && c.value.trim() === ""),
  );
  const only = elements[0];
  if (
    elements.length !== 1 ||
    stray ||
    only?.type !== "element" ||
    only.tagName !== "svg"
  ) {
    throw new DocsBuildError(
      `${label}: an SVG file must contain a single <svg> element and nothing else`,
    );
  }
}

/**
 * Checks the URLs a code fence's info string carries (`href=`, `vscode=`),
 * which become links after the HTML pass has run (codeblocks.ts, diffs.ts).
 * Untrusted docs may link out over http(s) only and get no VS Code links.
 */
export function remarkCheckFenceLinks() {
  return (tree: MdastRoot, file: VFile) => {
    const policy = policyOf(file);
    const url = { trust: policy.trust, untrusted: policy.untrusted };
    visit(tree, "code", (node) => {
      if (!node.meta) return;
      const where = whereOf(file, node.position);
      const href = metaAttribute(node.meta, "href");
      if (href !== undefined) {
        const scheme = schemeOf(href);
        const why =
          policy.trust === "untrusted" &&
          scheme !== "http" &&
          scheme !== "https"
            ? `code block href= must be an http(s) URL (found "${href.slice(0, 60)}")`
            : checkUrl(href, "link", url);
        if (why !== null) {
          throw new DocsBuildError(`${where}: code block href=: ${why}`);
        }
      }
      const vscode = metaAttribute(node.meta, "vscode");
      if (vscode !== undefined && policy.trust === "untrusted") {
        throw new DocsBuildError(
          `${where}: code block vscode= links aren't allowed in untrusted docs`,
        );
      }
    });
  };
}
