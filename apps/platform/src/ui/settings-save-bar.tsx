"use client";

import { useState } from "react";
import {
  ArrowCounterClockwiseIcon,
  SpinnerGapIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react/ssr";
import { useSettingsForm } from "~/ui/settings-form";

/**
 * The page's one save affordance, fixed to the bottom of the viewport.
 *
 * It has to be fixed rather than sit at the end of the form: the account page
 * is taller than a viewport, and a member who edits their preferred name at
 * the top should not have to hunt for a button at the bottom to commit it.
 *
 * z-40 matches AnnouncementBanner — under the z-50 dialog and sheet overlays,
 * and under sonner's toasts. The two never share a page (`showsAnnouncement`
 * keeps the notice off `/account` and every other signed-in surface), and
 * `announcement.test.ts` pins that down so they cannot start to.
 */

/** Animated "⌘ S" / "Ctrl S" hint, shown inside the button while there is something to save. */
function ShortcutHint({ show }: { show: boolean }) {
  const [isMac] = useState(
    () =>
      typeof navigator !== "undefined" &&
      /Mac|iPhone|iPad|iPod/.test(navigator.userAgent),
  );

  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 overflow-hidden transition-[grid-template-columns] duration-200 ease-in-out ${
        show ? "grid-cols-[1fr]" : "grid-cols-[0fr]"
      }`}
    >
      <span
        className={`mt-px ml-[1ch] flex items-center gap-0.5 overflow-hidden transition-opacity duration-200 ease-in-out ${
          show ? "opacity-100" : "opacity-0"
        }`}
      >
        <kbd className="rounded-sm border border-b-2 border-current/20 bg-current/10 px-1 font-mono text-[0.6875rem] font-normal whitespace-nowrap">
          {isMac ? "⌘" : "Ctrl"}
        </kbd>
        <kbd className="rounded-sm border border-b-2 border-current/20 bg-current/10 px-1 font-mono text-[0.6875rem] font-normal whitespace-nowrap">
          S
        </kbd>
      </span>
    </span>
  );
}

const listFormatter = new Intl.ListFormat("en", {
  style: "long",
  type: "conjunction",
});

export default function SettingsSaveBar() {
  const { dirtyCount, invalidLabels, isSaving, saveAll, resetAll } =
    useSettingsForm();

  const show = dirtyCount > 0;
  const blocked = invalidLabels.length > 0;

  return (
    /* Kept mounted so it can animate both ways, and `inert` while hidden so a
       bar nobody can see is not in the tab order. The gutter is
       pointer-events-none for the same reason as the announcement's: it spans
       the viewport and would otherwise swallow clicks on the page behind it. */
    <div
      inert={!show}
      aria-hidden={!show}
      className={`pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] transition-[translate,opacity] duration-200 ease-out @sm:px-6 ${
        show ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
      }`}
    >
      {/* Grounds the bar against whatever is scrolling under it. Same
          mask-image trick as the announcement banner: backdrop-filter takes no
          gradient, so the fade goes on the mask and takes the blur with it. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-6 bottom-0 bg-black/50 [mask-image:linear-gradient(to_top,#000_0%,#000_20%,transparent_100%)] supports-backdrop-filter:backdrop-blur-sm"
      />

      <div className="pointer-events-auto relative mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border-2 border-mauve-700 bg-mauve-950 px-4 py-3 shadow-lg shadow-black/40">
        <p
          role="status"
          className={`min-w-0 flex-1 text-sm leading-tight text-balance ${
            blocked ? "text-rose-300" : "text-mauve-300"
          }`}
        >
          {blocked ? (
            <span className="flex items-start gap-2">
              <WarningCircleIcon
                weight="fill"
                aria-hidden
                className="mt-0.5 size-4 shrink-0"
              />
              <span>
                Fix {listFormatter.format(invalidLabels)} before saving.
              </span>
            </span>
          ) : (
            <>
              {dirtyCount} unsaved{" "}
              {dirtyCount === 1 ? "change" : "changes"}
            </>
          )}
        </p>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={resetAll}
            disabled={isSaving}
            className="flex shrink-0 items-center gap-[1ch] self-stretch rounded-sm border border-mauve-700 bg-mauve-800 px-3 py-1.5 text-sm font-medium text-mauve-300 inset-ring-mauve-600 transition-colors outline-none hover:border-mauve-500 hover:bg-mauve-700 hover:text-white hover:inset-ring-1 focus-visible:ring-2 focus-visible:ring-mauve-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
          >
            <ArrowCounterClockwiseIcon size={14} aria-hidden />
            Reset
          </button>
          <button
            type="button"
            onClick={saveAll}
            disabled={isSaving || blocked}
            className="relative flex items-center justify-center rounded-sm border-2 border-white bg-white px-4 py-1.5 text-sm font-medium text-black transition outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 enabled:hover:bg-transparent enabled:hover:text-white enabled:hover:shadow-sm enabled:hover:shadow-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? (
              <SpinnerGapIcon className="animate-spin [animation-duration:750ms]" />
            ) : (
              <>
                Save
                <ShortcutHint show={show && !blocked} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
