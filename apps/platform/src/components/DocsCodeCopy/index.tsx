"use client";

import { useEffect } from "react";

/**
 * The copy buttons on a docs page's code blocks. The compiler writes each
 * block's button into the page's HTML (`[data-copy]` in `figure.docs-code`,
 * see @devdogsuga/docs-compiler's codeblocks.ts), so one listener here serves
 * them all.
 *
 * A terminal copies its commands alone: no prompts, no `#` annotations, no
 * idle prompt. Other code copies every line, less the rows marking skipped
 * lines of an excerpt. The line numbers are CSS and never in the text.
 */
export function blockText(figure: Element): string {
  const terminal = figure.getAttribute("data-kind") === "terminal";
  const lines = Array.from(figure.querySelectorAll("pre code > .line"));
  return lines
    .filter(
      (line) =>
        !line.classList.contains("docs-code-gap") &&
        !line.classList.contains("docs-shell-idle") &&
        !(terminal && line.classList.contains("docs-shell-comment")),
    )
    .map((line) => {
      const copy = line.cloneNode(true) as Element;
      copy.querySelectorAll(".docs-prompt").forEach((el) => el.remove());
      return copy.textContent ?? "";
    })
    .filter((text) => !terminal || text.trim() !== "")
    .join("\n");
}

export default function DocsCodeCopy() {
  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>();

    async function onClick(event: MouseEvent) {
      const button = (event.target as Element | null)?.closest("[data-copy]");
      const figure = button?.closest("figure.docs-code");
      if (!button || !figure) return;
      try {
        await navigator.clipboard.writeText(blockText(figure));
      } catch {
        return;
      }
      const label = button.querySelector(".docs-code-copy-label");
      button.setAttribute("data-copied", "");
      if (label) label.textContent = "Copied";
      const timer = setTimeout(() => {
        button.removeAttribute("data-copied");
        if (label) label.textContent = "Copy";
        timers.delete(timer);
      }, 1500);
      timers.add(timer);
    }

    const listener = (event: MouseEvent) => void onClick(event);
    document.addEventListener("click", listener);
    return () => {
      document.removeEventListener("click", listener);
      timers.forEach(clearTimeout);
    };
  }, []);

  return null;
}
