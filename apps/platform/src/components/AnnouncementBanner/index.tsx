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
  /** The eyebrow chip. */
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
        <aside
          aria-label="Club announcement"
          className={cn(
            "animate-in slide-in-from-bottom-6 fade-in shadow-block-md pointer-events-auto relative isolate mx-auto flex max-w-4xl flex-col gap-2.5 overflow-hidden rounded-lg border-2 border-black px-4 py-3 text-black duration-500 motion-reduce:animate-none sm:flex-row sm:items-center sm:gap-4",
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

            <p className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
              <span
                className={cn(
                  "font-display shrink-0 rounded-sm px-1.5 py-0.5 text-[0.7rem] font-extrabold tracking-widest uppercase",
                  toneClasses.chip,
                )}
              >
                {eyebrow}
              </span>
              <span className="text-sm font-semibold text-balance sm:text-[0.9rem]">
                {message}
              </span>
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
        </aside>
      </div>
    </>
  );
}
