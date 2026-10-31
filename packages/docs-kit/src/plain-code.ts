/**
 * Code blocks with Shiki's frame and none of its colour.
 *
 * Shiki's Oniguruma engine compiles WebAssembly at run time, which the Workers
 * runtime forbids, so a page rendered inside the platform's Worker cannot be
 * highlighted there. This plugin stands in for `@shikijs/rehype` on that path:
 * it gives every fenced block the same tree Shiki would (a `pre.shiki` of
 * `span.line`s) and hands it to the same `docsCodeBlocks` transformer, so the
 * frame, the tab, the line numbers, the terminal prompts and every check on the
 * fence's info string (`lines=` naming one number per line, `vscode=`, `href=`)
 * run exactly as they do in the build. Only the token colours are missing.
 * That is what lets a project's docs be judged ready in the Worker by the rules
 * the candidate build enforces.
 *
 * It imports no part of Shiki.
 */
import type { Element, ElementContent, Root } from "hast";
import { toString } from "hast-util-to-string";
import { visit } from "unist-util-visit";
import { docsCodeBlocks } from "./codeblocks.js";

/** rose-pine-moon's base text and ground, so an unhighlighted block sits where a highlighted one does. */
const PRE_STYLE = "--shiki-dark:#e0def4;--shiki-dark-bg:#232136";

function classesOf(el: Element): string[] {
  const value = el.properties.className;
  return Array.isArray(value) ? value.map(String) : [];
}

function lineOf(value: string): Element {
  return {
    type: "element",
    tagName: "span",
    properties: { className: ["line"] },
    children: value === "" ? [] : [{ type: "text", value }],
  };
}

export function rehypePlainCode() {
  const frame = docsCodeBlocks();
  return (tree: Root) => {
    visit(tree, "element", (node: Element, index, parent) => {
      if (node.tagName !== "pre" || parent === undefined || index === undefined)
        return;
      const code = node.children.find(
        (child): child is Element =>
          child.type === "element" && child.tagName === "code",
      );
      if (code === undefined) return;

      const lang =
        classesOf(code)
          .find((name) => name.startsWith("language-"))
          ?.slice("language-".length) ?? "text";
      const meta = String(code.properties["metastring"] ?? "");
      const lines = toString(code).replace(/\n$/, "").split("\n");

      const body: Element = {
        type: "element",
        tagName: "code",
        properties: {},
        children: lines.flatMap((line, i): ElementContent[] =>
          i === 0
            ? [lineOf(line)]
            : [{ type: "text", value: "\n" }, lineOf(line)],
        ),
      };
      const pre: Element = {
        type: "element",
        tagName: "pre",
        properties: { className: ["shiki"], style: PRE_STYLE, tabIndex: 0 },
        children: [body],
      };
      const root: Root = { type: "root", children: [pre] };

      // The context Shiki gives its transformers: the language and the raw info string.
      const context = { options: { lang, meta: { __raw: meta } } };
      frame.code?.call(context as never, body);
      frame.root?.call(context as never, root);

      parent.children.splice(index, 1, ...(root.children as Element[]));
      return index + root.children.length;
    });
  };
}
