"use client";

import { DiffFile, DiffModeEnum, DiffView } from "@git-diff-view/react";
import "@git-diff-view/react/styles/diff-view-pure.css";
import { useMemo, useState } from "react";
import type { DocsDiff as DocsDiffData } from "~/lib/docsDiffs";
import { cn } from "~/lib/cn";

const MODES = [
  { mode: DiffModeEnum.Unified, label: "Unified" },
  { mode: DiffModeEnum.Split, label: "Split" },
] as const;

/**
 * One file diff from a docs page (see ~/lib/docsDiffs), in @git-diff-view's
 * viewer: the file's own highlighting, real line numbers, and a unified/split
 * toggle.
 *
 * The `DiffFile` is built during render rather than in an effect, so the
 * server renders the finished diff into the page and hydration finds the same
 * markup: the diff is there without JavaScript, and for search.
 * Only the hunks travel with the page, not the whole files, so there is no
 * surrounding context to expand into.
 */
export default function DocsDiff({ file, lang, patch }: DocsDiffData) {
  const [mode, setMode] = useState<DiffModeEnum>(DiffModeEnum.Unified);

  const diffFile = useMemo(() => {
    const diff = new DiffFile(file, "", file, "", [patch], lang, lang);
    diff.initTheme("dark");
    diff.init();
    diff.buildUnifiedDiffLines();
    diff.buildSplitDiffLines();
    return diff;
  }, [file, lang, patch]);

  return (
    <figure className="docs-diff not-prose border-border my-6 overflow-hidden rounded-md border">
      <figcaption className="border-border flex items-center justify-between gap-3 border-b bg-mauve-900 px-3 py-1.5">
        <span className="truncate font-mono text-xs text-mauve-300">
          {file}
        </span>
        <div
          role="group"
          aria-label="Diff layout"
          className="flex shrink-0 gap-0.5 rounded-sm bg-mauve-950 p-0.5 max-sm:hidden"
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
      </figcaption>
      <DiffView
        diffFile={diffFile}
        diffViewMode={mode}
        diffViewTheme="dark"
        diffViewHighlight
        diffViewFontSize={13}
      />
    </figure>
  );
}
