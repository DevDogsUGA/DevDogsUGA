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
import { randomBytes } from "node:crypto";
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

/** Letters only: hast turns the attribute name back into a property by case. */
const STAMP = `docsGen${[...randomBytes(12)]
  .map((byte) => String.fromCharCode(97 + (byte % 26)))
  .join("")}`;

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
      node.properties[STAMP] = "";
    });
  };
}

function isStamped(node: Element): boolean {
  return Object.keys(node.properties).some(
    (name) => name.toLowerCase() === STAMP.toLowerCase(),
  );
}

function unstamp(node: Element): void {
  for (const name of Object.keys(node.properties)) {
    if (name.toLowerCase() === STAMP.toLowerCase())
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
