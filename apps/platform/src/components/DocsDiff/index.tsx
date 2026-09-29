"use client";

import { CopyIcon, GithubLogoIcon } from "@phosphor-icons/react/ssr";
import { DiffFile, DiffModeEnum, DiffView } from "@git-diff-view/react";
import "@git-diff-view/react/styles/diff-view-pure.css";
import { useEffect, useMemo, useState } from "react";
import type { DocsDiff as DocsDiffData } from "~/lib/docsDiffs";
import { cn } from "~/lib/cn";

const MODES = [
  { mode: DiffModeEnum.Unified, label: "Unified" },
  { mode: DiffModeEnum.Split, label: "Split" },
] as const;

/** The code as it stands after the change: every context and added line of
 * the diff's hunks, a blank line between hunks. What "Copy" takes. */
export function newSide(patch: string): string {
  const hunks: string[][] = [];
  for (const line of patch.split("\n")) {
    if (line.startsWith("@@")) hunks.push([]);
    else if (hunks.length > 0 && (line.startsWith(" ") || line.startsWith("+")))
      hunks.at(-1)!.push(line.slice(1));
    else if (hunks.length > 0 && line === "") hunks.at(-1)!.push("");
  }
  return hunks.map((hunk) => hunk.join("\n").trimEnd()).join("\n\n");
}

/**
 * One file diff from a docs page (see ~/lib/docsDiffs), in @git-diff-view's
 * viewer: the file's own highlighting, real line numbers, and a unified/split
 * toggle, under the same file tab and copy button as the page's other code
 * blocks (`.docs-code-bar`, styles/globals.css).
 *
 * The `DiffFile` is built during render rather than in an effect, so the
 * server renders the finished diff into the page and hydration finds the same
 * markup: the diff is there without JavaScript, and for search.
 * A block that held the whole file (the workshop pages' diffs) arrives with
 * both versions of it, which is what lets the viewer expand the context
 * between and around the hunks; one that held only hunks has nothing to
 * expand into. Long lines wrap, as they do in the plain code blocks.
 */
export default function DocsDiff({
  file,
  lang,
  patch,
  oldContent = "",
  newContent = "",
  href,
}: DocsDiffData) {
  const [mode, setMode] = useState<DiffModeEnum>(DiffModeEnum.Unified);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(newSide(patch));
      setCopied(true);
    } catch {
      // No clipboard access: nothing to confirm.
    }
  }

  const diffFile = useMemo(() => {
    const diff = new DiffFile(
      file,
      oldContent,
      file,
      newContent,
      [patch],
      lang,
      lang,
    );
    diff.initTheme("dark");
    diff.init();
    diff.buildUnifiedDiffLines();
    diff.buildSplitDiffLines();
    return diff;
  }, [file, lang, patch, oldContent, newContent]);

  return (
    <figure className="docs-diff not-prose border-border my-6 overflow-hidden rounded-md border">
      <figcaption className="docs-code-bar">
        <span className="docs-code-tab">{file}</span>
        <div className="flex shrink-0 items-center gap-2 self-center pb-1.5">
          <div
            role="group"
            aria-label="Diff layout"
            className="flex gap-0.5 rounded-sm bg-mauve-900 p-0.5 max-sm:hidden"
          >
            {MODES.map(({ mode: value, label }) => (
              <button
                key={label}
                type="button"
                aria-pressed={mode === value}
                onClick={() => setMode(value)}
                className={cn(
                  "rounded-sm px-2 py-0.5 text-xs transition-colors",
                  mode === value
                    ? "bg-mauve-800 text-white"
                    : "text-mauve-400 hover:text-white",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {href && (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Compare on GitHub"
              className="docs-code-link"
            >
              <GithubLogoIcon className="size-3.5" />
              <span className="docs-code-link-label">GitHub</span>
            </a>
          )}
          <button
            type="button"
            onClick={copy}
            aria-label="Copy the new code"
            data-copied={copied || undefined}
            className="docs-code-copy !mb-0"
          >
            <CopyIcon className="size-3.5" />
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </figcaption>
      <DiffView
        diffFile={diffFile}
        diffViewMode={mode}
        diffViewTheme="dark"
        diffViewHighlight
        diffViewWrap
        diffViewFontSize={13}
      />
    </figure>
  );
}
