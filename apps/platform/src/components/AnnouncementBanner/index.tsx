"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowRightIcon,
  ArrowSquareOutIcon,
  MegaphoneIcon,
  XIcon,
} from "@phosphor-icons/react/ssr";
import {
  ANNOUNCEMENT,
  ANNOUNCEMENT_STORAGE_KEY,
  showsAnnouncement,
  type AnnouncementTone,
} from "~/config/announcement";
import { cn } from "~/lib/cn";

interface ToneClasses {
  /** The card itself. */
  card: string;
  /** The pulse behind the megaphone. */
  pulse: string;
  /** The tab that carries the eyebrow, notched onto the card's top edge. */
  chip: string;
  /**
   * The block shadow the card rests on, and the one the action button throws
   * on hover. Black — the site's usual offset color — is invisible against a
   * near-black page, so a floating card has to borrow the tone's accent.
   */
  blockShadow: string;
}

/**
 * Every tone is dark-on-bright. The site's chrome is near-black
 * (`--background` is mauve-950), so a saturated light card is the single
 * loudest thing that can sit over the page without inventing a new palette.
 */
const TONES: Record<AnnouncementTone, ToneClasses> = {
  urgent: {
    card: "bg-amber-300",
    pulse: "bg-rose-600/50",
    chip: "bg-rose-600 text-white",
    blockShadow: "shadow-rose-600",
  },
  info: {
    card: "bg-sky-300",
    pulse: "bg-sky-700/40",
    chip: "bg-sky-800 text-white",
    blockShadow: "shadow-sky-800",
  },
};

/**
 * Runs while the browser is still parsing the document, ahead of the card
 * markup below it, and stamps `<html data-announcement="dismissed">` when this
 * session already waved the current notice away. `globals.css` hides the card
 * on that attribute.
 *
 * The alternative — reading session storage from an effect — renders the card,
 * paints it, then rips it out a frame later, so anyone who has dismissed the
 * notice watches it flash up from the bottom of every page they load. The
 * markup has to be in the server HTML (it is in the static shell, outside the
 * page's Suspense boundary), so hiding it has to happen before first paint,
 * and only a blocking script gets to run that early.
 */
const HIDE_SCRIPT = ANNOUNCEMENT
  ? `try{if(sessionStorage.getItem(${JSON.stringify(
      ANNOUNCEMENT_STORAGE_KEY,
    )})===${JSON.stringify(
      ANNOUNCEMENT.id,
    )})document.documentElement.dataset.announcement="dismissed"}catch(e){}`
  : "";

export default function AnnouncementBanner() {
  const pathname = usePathname();
  const [dismissed, setDismissed] = useState(false);

  if (!ANNOUNCEMENT || dismissed || !showsAnnouncement(pathname)) return null;

  const { id, eyebrow, message, action, tone } = ANNOUNCEMENT;
  const toneClasses = TONES[tone];

  const dismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(ANNOUNCEMENT_STORAGE_KEY, id);
    } catch {
      // Session storage unavailable (private-mode restrictions, cookies
      // blocked). The card still closes for this page view; it just comes back
      // on the next load, which is the honest failure direction for a notice.
    }
  };

  return (
    <>
      {/* A plain inline <script>, not next/script: it has to execute during
          parse, before the markup below it exists. See HIDE_SCRIPT. */}
      <script dangerouslySetInnerHTML={{ __html: HIDE_SCRIPT }} />

      {/* z-40 puts the notice over the page but under the z-50 dialog and
          sheet overlays, so opening a dialog dims it along with everything
          else, and under sonner's toasts (bottom-right, and on their own very
          high z-index), so a toast is never buried by it.

          The gutter is pointer-events-none: it spans the whole viewport width
          and would otherwise swallow clicks on whatever sits behind it. */}
      <div
        data-slot="announcement-banner"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:p-6 md:pb-[max(1.5rem,env(safe-area-inset-bottom))]"
      >
        {/* The landmark wraps card AND tab, so a screen reader reads the
            eyebrow as part of the notice rather than as loose text beside it.
            It also carries the entrance animation, so the tab rises with the
            card instead of being left behind, and it must NOT clip: the tab
            hangs above its box. */}
        <aside
          aria-label="Club announcement"
          className="animate-in slide-in-from-bottom-6 fade-in pointer-events-auto relative mx-auto max-w-4xl duration-500 motion-reduce:animate-none"
        >
          <div
            className={cn(
              "shadow-block-md relative isolate flex flex-col gap-2.5 overflow-hidden rounded-lg px-4 py-3 text-black sm:flex-row sm:items-center sm:gap-4",
              toneClasses.card,
              toneClasses.blockShadow,
            )}
          >
            {/* The site's dot texture, dialled down so it reads as paper grain
              rather than as a second pattern competing with the copy. */}
            <span
              aria-hidden
              className="bg-dot-grid-dense pointer-events-none absolute inset-0 -z-10 opacity-[0.07]"
            />

            {/* Marching ants in place of a solid border, the same stroke the
              partners badge uses. Drawn as an SVG rather than a `border`
              because the dashes have to move, and only stroke-dashoffset can
              do that. Inset 1px with a 2px stroke so it occupies exactly the
              2px the `border-2` used to, leaving the card's box unchanged.

              `rx` is the card's own radius less that 1px inset: --radius-lg is
              0.625rem, so 10px on the outside, 9 in here.

              Under reduced motion the animation stops, which drops the
              dasharray the keyframes carry and leaves a plain solid stroke —
              the border this replaced, which is the right thing to land on. */}
            <svg
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 h-full w-full"
            >
              <rect
                x="1"
                y="1"
                width="calc(100% - 2px)"
                height="calc(100% - 2px)"
                rx="9"
                fill="none"
                stroke="black"
                strokeWidth="2"
                className="animate-march-dashes motion-reduce:animate-none"
              />
            </svg>

            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span className="relative flex size-7 shrink-0 items-center justify-center">
                <span
                  aria-hidden
                  className={cn(
                    "absolute inset-0 animate-ping rounded-full motion-reduce:hidden",
                    toneClasses.pulse,
                  )}
                />
                {/* Mirrored: Phosphor's megaphone points right, which aims it
                  off the edge of the card. Flipped, it points into the copy. */}
                <MegaphoneIcon
                  weight="fill"
                  className="relative size-5 shrink-0 -scale-x-100"
                />
              </span>

              {/* max-w-prose caps the measure. The card runs to max-w-4xl so it
                has room for the action button on the same row, but a line of
                copy that wide is a chore to read — the text stops at a
                comfortable measure and wraps, and the leftover width stays
                with the button. */}
              <p className="max-w-prose min-w-0 text-sm font-semibold text-balance sm:text-[0.9rem]">
                {message}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1.5 self-end sm:self-auto">
              <Link
                href={action.href}
                {...(action.external
                  ? { target: "_blank", rel: "noreferrer" }
                  : {})}
                className={cn(
                  "hover:shadow-block-sm transition-lift flex items-center gap-2 rounded-sm border-2 border-black bg-black px-3.5 py-1.5 text-sm font-semibold text-white hover:-translate-x-0.5 hover:-translate-y-0.5",
                  toneClasses.blockShadow,
                )}
              >
                {action.label}
                {action.external ? (
                  <ArrowSquareOutIcon className="size-4" />
                ) : (
                  <ArrowRightIcon className="size-4" />
                )}
              </Link>

              <button
                type="button"
                onClick={dismiss}
                aria-label="Dismiss announcement"
                className="flex size-8 shrink-0 items-center justify-center rounded-sm text-black/60 transition-colors hover:bg-black/10 hover:text-black focus-visible:ring-2 focus-visible:ring-black focus-visible:outline-none"
              >
                <XIcon className="size-4" weight="bold" />
              </button>
            </div>
          </div>

          {/* The tab, and the trick that makes the outline continuous.

              It comes AFTER the card in the DOM so its opaque fill paints
              over the card's top stroke, erasing exactly the span the tab
              covers — that erased span is the "mouth" the tab opens into.
              `translate-y` drops it 2px into the card so the overlap is
              precisely the card's stroke width, leaving no seam and no
              doubled line.

              Its own stroke is an over-tall rect — 100% + 20px — clipped by
              `overflow-hidden` at the tab's bottom edge. That is what removes
              the bottom line without needing to know the tab's width, which
              depends on the eyebrow text and so is not knowable in a static
              path. What survives the clip is left side, rounded top, right
              side: a tab outline that runs down to meet the card's top edge
              at both ends. */}
          <p
            className={cn(
              "absolute bottom-full left-4 translate-y-[2px] overflow-hidden rounded-t-lg px-2.5 py-1",
              toneClasses.chip,
            )}
          >
            <svg
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 h-full w-full"
            >
              <rect
                x="1"
                y="1"
                width="calc(100% - 2px)"
                height="calc(100% + 20px)"
                rx="9"
                fill="none"
                stroke="black"
                strokeWidth="2"
                className="animate-march-dashes motion-reduce:animate-none"
              />
            </svg>
            <span className="font-display relative text-[0.7rem] font-extrabold tracking-widest uppercase">
              {eyebrow}
            </span>
          </p>
        </aside>
      </div>
    </>
  );
}
