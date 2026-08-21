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
   * on hover. The card takes `shadow-block-outlined-lg`: the size the section
   * cards use, but outlined, and in the tone's accent rather than their black.
   * Those cards sit on light section backgrounds where a black block reads on
   * its own; over a near-black page black is no shadow at all, so the block
   * has to be coloured — and a coloured block with no edge is a smear, which
   * is what the black outline is for. It picks up where the card's own
   * `border-2 border-black` leaves off.
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
          {/* Template literal, not cn(): tailwind-merge files `shadow-block-lg`
              and `shadow-rose-600` under one `shadow` group and keeps only the
              last, which silently deletes the block shadow and leaves a colour
              with nothing to colour. Every other block-shadow call site on the
              site (EventCard, PartnersSection, LeaderCard) concatenates for
              the same reason. There is nothing here for a merge to resolve
              anyway — no caller passes a className in. */}
          <div
            className={`shadow-block-outlined-lg relative isolate flex flex-col gap-2.5 overflow-hidden rounded-lg border-2 border-black px-4 py-3 text-black sm:flex-row sm:items-center sm:gap-4 ${toneClasses.card} ${toneClasses.blockShadow}`}
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

              {/* max-w-prose caps the measure. The card runs to max-w-4xl so it
                has room for the action button on the same row, but a line of
                copy that wide is a chore to read — the text stops at a
                comfortable measure and wraps, and the leftover width stays
                with the button. */}
              <p className="max-w-prose min-w-0 text-sm leading-snug font-semibold text-balance sm:text-base">
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

          {/* The tab. It comes AFTER the card in the DOM so its opaque fill
              paints over the card's top border, erasing exactly the span it
              covers, and `translate-y` drops it 2px into the card so that
              erased band is precisely the border's width — no seam, no
              doubled line. `border-b-0` leaves its own outline open at the
              bottom, so the two borders read as one silhouette.

              No block shadow here on purpose: the card's falls down and to the
              right, away from the tab, while a shadow on the tab itself would
              land squarely on the card's face. */}
          <p
            className={cn(
              "absolute bottom-full left-4 translate-y-[2px] rounded-t-lg border-2 border-b-0 border-black px-2.5 py-1",
              toneClasses.chip,
            )}
          >
            <span className="font-display text-[0.7rem] font-extrabold tracking-widest uppercase">
              {eyebrow}
            </span>
          </p>
        </aside>
      </div>
    </>
  );
}
