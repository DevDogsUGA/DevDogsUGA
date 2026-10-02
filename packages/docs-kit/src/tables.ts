/**
 * Copy buttons on a table's values, for a table a reader copies from into
 * some other form (a provider's settings: its issuer, an identifier, a scope
 * list). Opt-in, because most tables (the API reference's types, a list of
 * environments) are there to read, and a button on every cell is noise:
 *
 * ```md
 * :::copyable
 * | Setting    | Value                          |
 * | ---------- | ------------------------------ |
 * | Issuer URL | `https://example.com/auth/v1`  |
 * :::
 * ```
 *
 * Inside the wrapper (`variants.ts` passes `:::copyable` through as a `div`),
 * every body cell that is nothing but one code span gets a button:
 *
 * ```html
 * <td>
 *   <span class="docs-copyable">
 *     <code>https://example.com/auth/v1</code>
 *     <button class="docs-copyable-copy" data-copy-inline>…</button>
 *   </span>
 * </td>
 * ```
 *
 * A cell with anything else in it (prose, a link, two code spans) is left
 * alone: there's no one value to copy. The platform's DocsCodeCopy copies the
 * code's text on click, the same listener that serves the code blocks.
 */
import type { Element, Root as HastRoot } from "hast";
import { visit } from "unist-util-visit";
import { COPY_ICON } from "./codeblocks.js";

export const COPYABLE_CLASS = "docs-copyable-table";

function addButton(cell: Element): void {
  const content = cell.children.filter(
    (child) => !(child.type === "text" && child.value.trim() === ""),
  );
  const code = content[0];
  if (
    content.length !== 1 ||
    code?.type !== "element" ||
    code.tagName !== "code"
  ) {
    return;
  }
  cell.children = [
    {
      type: "element",
      tagName: "span",
      properties: { className: ["docs-copyable"] },
      children: [
        code,
        {
          type: "element",
          tagName: "button",
          properties: {
            type: "button",
            className: ["docs-copyable-copy"],
            dataCopyInline: "",
            ariaLabel: "Copy",
          },
          children: [COPY_ICON],
        },
      ],
    },
  ];
}

export function rehypeCopyableCells() {
  return (tree: HastRoot) => {
    visit(tree, "element", (node: Element) => {
      const classes = node.properties.className;
      if (!Array.isArray(classes) || !classes.includes(COPYABLE_CLASS)) {
        return;
      }
      visit(node, "element", (cell: Element) => {
        if (cell.tagName === "td") addButton(cell);
      });
    });
  };
}
