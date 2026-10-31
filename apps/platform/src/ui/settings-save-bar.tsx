"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type Ref,
} from "react";
import { createPortal } from "react-dom";
import {
  CheckCircleIcon,
  SpinnerGapIcon,
  WarningCircleIcon,
  XCircleIcon,
} from "@phosphor-icons/react/ssr";
import { Button } from "~/ui/button";
import { Kbd } from "~/ui/kbd";
import { cn } from "~/lib/cn";
import { useSettingsForm, type SettingsSaveResult } from "~/ui/settings-form";

/**
 * The page's one save affordance, fixed to the bottom of the viewport.
 *
 * Fixed rather than at the end of the form because the account page is taller
 * than a viewport, and someone who edits their preferred name at the top should
 * not have to hunt for a button at the bottom to commit it.
 *
 * Cosmic `.savebar` (sticky bottom, a 2px rule above, an 8px shade over the
 * page), fixed to the viewport here. z-40 matches AnnouncementBanner, under the z-50 dialog and sheet overlays and
 * under sonner's toasts. The two never share a page (`showsAnnouncement` keeps
 * the notice off `/dashboard/profile` and every other signed-in page), and
 * `announcement.test.ts` pins that down so they cannot start to.
 *
 * Rendered through a portal to <body>, because z-40 alone was not enough to
 * clear the footer. The bar is written in the account page's tree, under two
 * elements that trap it:
 *
 *   <main className="@container relative">   <- container-type: inline-size
 *     <div className="relative isolate">     <- PageShell
 *
 * `isolation: isolate` creates a stacking context, and `container-type` applies
 * layout containment, which creates one too, so the bar's z-40 only ordered it
 * against its siblings inside PageShell. <footer> is positioned and comes after
 * <main> in document order, so with both at the default z-index the footer
 * painted last and won. Layout containment also makes <main> the containing
 * block for fixed-position descendants, so "fixed to the viewport" was not true
 * either. Portalling to <body> steps outside both, where AnnouncementBanner and
 * AppSwitcher already sit for the same reason.
 *
 * The breakpoints below are `sm:`, not `@sm:`. Leaving <main> leaves its
 * `@container` behind, and a container query with no container above it never
 * matches, so the bar would have been pinned to its narrowest styles at every
 * width. Viewport breakpoints are the right unit for something fixed to the
 * viewport anyway, which is why AnnouncementBanner uses them too. They also
 * land later: `@sm` resolved against <main>, so it flipped at 384px where `sm:`
 * flips at 640px. All that rides on it is padding, the gap between the two
 * controls, and whether the validation warning shows its icon.
 */

/**
 * Static "⌘ S" / "Ctrl S" hint. It used to slide open, so a keyboard shortcut
 * hint animated every time the button re-rendered.
 */
function ShortcutHint() {
  const [isMac] = useState(
    () =>
      typeof navigator !== "undefined" &&
      /Mac|iPhone|iPad|iPod/.test(navigator.userAgent),
  );

  return (
    <span aria-hidden="true" className="ml-[1ch] flex items-center gap-1">
      <Kbd className="text-inherit!">{isMac ? "\u2318" : "Ctrl"}</Kbd>
      <Kbd className="text-inherit!">S</Kbd>
    </span>
  );
}

/**
 * The mount check below never updates after its first read, so there is nothing
 * to subscribe to. Defined at module scope because useSyncExternalStore
 * re-subscribes whenever this identity changes.
 */
const subscribeToNothing = () => () => undefined;

const listFormatter = new Intl.ListFormat("en", {
  style: "long",
  type: "conjunction",
});

type SaveBarStatus = "dirty" | "blocked" | "saving" | "saved" | "error";

interface SettingsSaveBarViewProps {
  status: SaveBarStatus;
  dirtyCount: number;
  invalidLabels: string[];
  /** Text of the saved / error outcome. */
  message?: string;
  isSaving: boolean;
  onSave: () => void;
  onReset: () => void;
  /** Spoken when a link click was swallowed; empty otherwise. */
  blockedMessage?: string;
  /** Hidden bars are `inert`: kept mounted so they animate, out of the tab order. */
  show?: boolean;
  /** Draws in the flow instead of fixed to the viewport (the gallery, tests). */
  inline?: boolean;
  /** The element the "swallowed click" shake runs on. */
  innerRef?: Ref<HTMLDivElement>;
}

/**
 * The bar's five looks (`.savebar` + `.state.*` in `settings-profile.html`).
 * Presentational: `SettingsSaveBar` feeds it from the form context, and the
 * gallery feeds it stubs to show every state.
 */
export function SettingsSaveBarView({
  status,
  dirtyCount,
  invalidLabels,
  message,
  isSaving,
  onSave,
  onReset,
  blockedMessage = "",
  show = true,
  inline = false,
  innerRef,
}: SettingsSaveBarViewProps) {
  const blocked = status === "blocked";
  const dirtyText = `${dirtyCount} unsaved ${dirtyCount === 1 ? "change" : "changes"}`;

  return (
    <div
      inert={!show}
      aria-hidden={!show}
      className={cn(
        "savebar transition-[translate,opacity] duration-200 ease-out motion-reduce:transition-none",
        inline
          ? "relative"
          : "pointer-events-auto fixed inset-x-0 bottom-0 z-40 pb-[env(safe-area-inset-bottom)]",
        show ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
      )}
    >
      <div className="wrap">
        <div
          ref={innerRef}
          className="in max-sm:h-auto max-sm:flex-wrap max-sm:gap-y-2 max-sm:py-3 [&_.state]:min-w-0"
        >
          {/* The shake is the whole feedback for a cancelled click. Same news,
              spoken. */}
          <span aria-live="assertive" className="sr-only">
            {blockedMessage}
          </span>

          {status === "saving" && (
            <span className="state saving" role="status">
              <SpinnerGapIcon
                aria-hidden
                className="animate-spin [animation-duration:750ms] motion-reduce:animate-none"
              />
              {"Saving\u2026"}
            </span>
          )}
          {status === "saved" && (
            <span className="state saved" role="status">
              <CheckCircleIcon aria-hidden weight="fill" />
              {message ?? "Saved."}
            </span>
          )}
          {status === "error" && (
            <span className="state error" role="alert">
              <XCircleIcon aria-hidden weight="fill" />
              {message ?? "Couldn\u2019t save."}
            </span>
          )}
          {(status === "dirty" || blocked) && (
            <span
              className={cn("state", blocked ? "error" : "dirty")}
              role="status"
            >
              <WarningCircleIcon aria-hidden weight="fill" />
              {blocked
                ? `Fix ${listFormatter.format(invalidLabels)} before saving.`
                : dirtyText}
            </span>
          )}

          <div className="acts">
            <Button
              type="button"
              variant="ghost"
              onClick={onReset}
              disabled={isSaving || status === "saved"}
            >
              Discard
            </Button>
            <Button
              type="button"
              onClick={onSave}
              loading={isSaving}
              disabled={blocked || status === "saved"}
            >
              Save
              {!blocked && !isSaving && <ShortcutHint />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SettingsSaveBar() {
  const {
    dirtyCount,
    invalidLabels,
    isSaving,
    saveAll,
    resetAll,
    blockedAt,
    result,
  } = useSettingsForm();

  const blocked = invalidLabels.length > 0;
  const innerRef = useRef<HTMLDivElement>(null);

  const status: SaveBarStatus = isSaving
    ? "saving"
    : blocked
      ? "blocked"
      : result?.kind === "error"
        ? "error"
        : dirtyCount > 0
          ? "dirty"
          : "saved";
  const show = dirtyCount > 0 || isSaving || result !== null;
  const shown: SettingsSaveResult | null = result;

  const mounted = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );

  const previousBlockedAt = useRef(blockedAt);
  const [blockedMessage, setBlockedMessage] = useState("");
  useEffect(() => {
    if (blockedAt === previousBlockedAt.current) return;
    previousBlockedAt.current = blockedAt;

    // The shake says nothing to a screen reader, and a link that does not fire
    // is the worst outcome there. Re-set on every block so a repeat click
    // re-announces.
    setBlockedMessage(
      `Navigation cancelled. Save or discard your ${dirtyCount === 1 ? "change" : "changes"} first.`,
    );
    const clear = setTimeout(() => setBlockedMessage(""), 4000);

    const inner = innerRef.current;
    if (!inner?.animate) return () => clearTimeout(clear);

    const reduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    // Reduced motion gets the same message without the movement: the bar
    // flashes instead.
    inner.animate(
      reduced
        ? [
            { filter: "brightness(1)" },
            { filter: "brightness(1.6)" },
            { filter: "brightness(1)" },
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

  if (!mounted) return null;

  // Rendered through a portal to <body> (see the note at the top of the file).
  // Kept mounted so it can animate both ways, and `inert` while hidden so a bar
  // nobody can see is not in the tab order.
  return createPortal(
    <SettingsSaveBarView
      status={status}
      dirtyCount={dirtyCount}
      invalidLabels={invalidLabels}
      message={shown?.message}
      isSaving={isSaving}
      onSave={saveAll}
      onReset={resetAll}
      blockedMessage={blockedMessage}
      show={show}
      innerRef={innerRef}
    />,
    document.body,
  );
}
