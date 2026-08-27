"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SpinnerGapIcon, WarningCircleIcon } from "@phosphor-icons/react/ssr";
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
 *
 * Rendered through a portal to <body>, because z-40 alone was not enough to
 * clear the footer. The bar is written in the account page's tree, which puts
 * it under two elements that trap it:
 *
 *   <main className="@container relative">   <- container-type: inline-size
 *     <div className="relative isolate">     <- PageShell
 *
 * `isolation: isolate` creates a stacking context outright, and
 * `container-type` applies layout containment, which creates one too — so the
 * bar's z-40 was only ever ordering it against its siblings inside PageShell,
 * never against the page. <footer> is positioned and comes after <main> in
 * document order, so with both at the default z-index the footer painted last
 * and won. Layout containment also makes <main> the containing block for
 * fixed-position descendants, so "fixed to the viewport" was not strictly true
 * either.
 *
 * Portalling to <body> steps outside both, which is exactly where
 * AnnouncementBanner and AppSwitcher already sit for the same reason: the site
 * layout mounts them last in the document, outside the flex column.
 *
 * Note the breakpoints below are `sm:`, not `@sm:`. Leaving <main> leaves its
 * `@container` behind, and a container query with no container above it never
 * matches — the bar would have been pinned to its narrowest styles at every
 * width. Viewport breakpoints are the honest unit for something fixed to the
 * viewport anyway, which is why AnnouncementBanner uses them too. They also
 * land later: `@sm` was resolving against <main>, so it flipped at 384px where
 * `sm:` flips at 640px. All that rides on it is padding, the gap between the
 * two controls, and whether the validation warning shows its icon.
 */

/**
 * Static "⌘ S" / "Ctrl S" hint. It used to slide open, which meant a hint about
 * a keyboard shortcut animating every time the button re-rendered — motion
 * spent on the least urgent thing in the bar.
 */
function ShortcutHint() {
  const [isMac] = useState(
    () =>
      typeof navigator !== "undefined" &&
      /Mac|iPhone|iPad|iPod/.test(navigator.userAgent),
  );

  return (
    <span aria-hidden="true" className="ml-[1ch] flex items-center gap-0.5">
      <kbd className="rounded-sm border border-b-2 border-current/20 bg-current/10 px-1 font-mono text-[0.6875rem] font-normal whitespace-nowrap">
        {isMac ? "⌘" : "Ctrl"}
      </kbd>
      <kbd className="rounded-sm border border-b-2 border-current/20 bg-current/10 px-1 font-mono text-[0.6875rem] font-normal whitespace-nowrap">
        S
      </kbd>
    </span>
  );
}

const listFormatter = new Intl.ListFormat("en", {
  style: "long",
  type: "conjunction",
});

export default function SettingsSaveBar() {
  const { dirtyCount, invalidLabels, isSaving, saveAll, resetAll, blockedAt } =
    useSettingsForm();

  const show = dirtyCount > 0;
  const blocked = invalidLabels.length > 0;
  const cardRef = useRef<HTMLDivElement>(null);

  /**
   * `document` does not exist while this renders on the server, so the target
   * is picked up after mount and the bar renders nothing before then.
   *
   * Nothing is lost by that. The bar is only ever on screen once a field is
   * dirty, and a field can only become dirty from a client interaction — so
   * there was never any meaningful server markup here to give up.
   */
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  useEffect(() => setPortalTarget(document.body), []);

  /**
   * Answer a swallowed link click.
   *
   * Driven from JS rather than a CSS class because it has to be able to fire
   * twice in a row — a member who clicks the same dead link again should get
   * the same shake, and re-adding a class that is already there animates
   * nothing. The Web Animations API restarts cleanly every call and needs no
   * keyframes in the global stylesheet.
   *
   * Skipped on the first render: `blockedAt` starts at 0 and nothing has been
   * blocked yet.
   */
  const previousBlockedAt = useRef(blockedAt);
  const [blockedMessage, setBlockedMessage] = useState("");
  useEffect(() => {
    if (blockedAt === previousBlockedAt.current) return;
    previousBlockedAt.current = blockedAt;

    // The shake says nothing to a screen reader, and a link that simply does
    // not fire is the most confusing possible outcome there. Re-set on every
    // block so a repeat click re-announces.
    setBlockedMessage(
      `Navigation cancelled. Save or discard your ${dirtyCount === 1 ? "change" : "changes"} first.`,
    );
    const clear = setTimeout(() => setBlockedMessage(""), 4000);

    const card = cardRef.current;
    if (!card?.animate) return () => clearTimeout(clear);

    const reduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    // `transform` rather than the `translate` property: universally animatable,
    // and the outer wrapper owns the bar's own translate-y so there is nothing
    // here to fight over.
    //
    // Reduced motion gets the same message without the movement — the edge
    // flares instead. Deliberately NOT boxShadow, which would blow away the
    // card's drop shadow for the length of the animation and read as a flicker.
    card.animate(
      reduced
        ? [
            { borderColor: "var(--color-mauve-600)" },
            { borderColor: "var(--color-white)" },
            { borderColor: "var(--color-mauve-600)" },
          ]
        : [
            { transform: "translateX(0)" },
            { transform: "translateX(-7px)" },
            { transform: "translateX(6px)" },
            { transform: "translateX(-4px)" },
            { transform: "translateX(3px)" },
            { transform: "translateX(0)" },
          ],
      { duration: reduced ? 600 : 400, easing: "ease-in-out" },
    );

    return () => clearTimeout(clear);
  }, [blockedAt, dirtyCount]);

  if (!portalTarget) return null;

  return createPortal(
    /* Kept mounted so it can animate both ways, and `inert` while hidden so a
       bar nobody can see is not in the tab order. The gutter is
       pointer-events-none for the same reason as the announcement's: it spans
       the viewport and would otherwise swallow clicks on the page behind it. */
    <div
      inert={!show}
      aria-hidden={!show}
      className={`pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] transition-[translate,opacity] duration-200 ease-out sm:px-6 ${
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

      {/* The surface deliberately does NOT match either thing behind it. The
          page is mauve-900 and the cards are mauve-950 inside a mauve-800
          border, so a dark bar with a dim edge read as one more card that
          happened to be stuck to the bottom of the window. Going lighter than
          both — mauve-800 on a mauve-600 edge — is what makes it chrome
          floating over the page rather than part of it, and the inset highlight
          plus the deeper drop shadow sell the "floating" half of that. */}
      <div
        ref={cardRef}
        /* Narrower than PageShell's max-w-5xl on purpose. At the same width it
           lined up edge-to-edge with the cards above it and read as the last
           one in the stack; pulled in, it stops sharing their gridlines and
           sits over the page as its own object. The border thinned to 1px for
           the same reason — at 2px the edge competed with the card borders
           instead of just containing the bar. */
        className="pointer-events-auto relative mx-auto flex w-full max-w-3xl items-center justify-between gap-x-3 rounded-lg border border-mauve-600 bg-mauve-800 px-3 py-3 shadow-2xl inset-ring-1 shadow-black/60 inset-ring-white/10 sm:gap-x-4 sm:px-4"
      >
        {/* The shake is the whole feedback for a cancelled click, and it is
            invisible to a screen reader. This is the same news, spoken. */}
        <span aria-live="assertive" className="sr-only">
          {blockedMessage}
        </span>

        {/* Leads the bar now. It is the reason the bar is on screen at all, so
            it reads first and carries the weight — the two controls that follow
            are what you do about it. `text-left` rather than centred: with the
            actions gathered on the right there is no second edge to balance
            against, and a centred count next to a left edge just looks adrift. */}
        <p
          role="status"
          className={`min-w-0 text-left text-sm leading-tight font-semibold ${
            blocked ? "text-rose-300" : "text-mauve-100"
          }`}
        >
          {blocked ? (
            <span className="flex items-center gap-1.5">
              <WarningCircleIcon
                weight="fill"
                aria-hidden
                className="hidden size-4 shrink-0 sm:inline"
              />
              <span>
                Fix {listFormatter.format(invalidLabels)} before saving.
              </span>
            </span>
          ) : (
            <>
              {dirtyCount} unsaved {dirtyCount === 1 ? "change" : "changes"}
            </>
          )}
        </p>

        {/* Both actions live on the right, discard nearest the text so Save
            keeps the outer corner — the far edge is the easiest target in the
            bar and it should belong to the safe action, not the destructive
            one. */}
        <div className="flex shrink-0 items-center gap-4 sm:gap-6">
          <button
            type="button"
            onClick={resetAll}
            disabled={isSaving}
            /* A link, not a button: two buttons side by side asked to be read
               as a pair of equal options, and discarding is not the equal of
               saving. Demoting it to text puts Save alone at button weight.
               Rose is what carries the warning now that the box is gone — this
               throws away everything typed since the last save with no undo
               behind it. Underline only on hover/focus, so it announces itself
               as clickable at the moment it is about to be clicked. */
            className="shrink-0 rounded-xs text-sm font-medium text-rose-400 underline-offset-4 transition outline-none hover:text-rose-300 hover:underline focus-visible:underline focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 focus-visible:ring-offset-mauve-800 disabled:pointer-events-none disabled:opacity-50"
          >
            Reset
          </button>

          <button
            type="button"
            onClick={saveAll}
            disabled={isSaving || blocked}
            className="relative flex shrink-0 items-center justify-center rounded-sm border-2 border-white bg-white px-4 py-1.5 text-sm font-medium text-black transition outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-mauve-800 enabled:hover:bg-transparent enabled:hover:text-white enabled:hover:shadow-sm enabled:hover:shadow-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? (
              <SpinnerGapIcon className="animate-spin [animation-duration:750ms]" />
            ) : (
              <>
                Save
                {!blocked && <ShortcutHint />}
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    portalTarget,
  );
}
