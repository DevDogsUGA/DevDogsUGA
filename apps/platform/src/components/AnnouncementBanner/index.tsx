"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
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
  /** The tab under the cursor. One step lighter — it is a close button. */
  chipHover: string;
  /**
   * The block shadow the card rests on, and the one the action button throws
   * on hover. The card takes `shadow-block-outlined-xl`: a step past the size
   * the section cards use, since it floats over the page rather than sitting
   * in a section, and outlined in the tone's accent rather than their black.
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
    chipHover: "hover:bg-rose-500",
    blockShadow: "shadow-rose-600",
  },
  info: {
    card: "bg-sky-300",
    pulse: "bg-sky-700/40",
    chip: "bg-sky-800 text-white",
    chipHover: "hover:bg-sky-700",
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

/**
 * How far the notice has to be dragged down before letting go closes it.
 * 50px is Radix Toast's default swipe threshold, which is a well-worn number
 * for exactly this gesture.
 */
const SWIPE_CLOSE_DISTANCE = 50;

/** How long the notice takes to leave, and to spring back from a short drag. */
const EXIT_MS = 200;

/** Travel before a press counts as a drag rather than a tap. */
const DRAG_SLOP = 4;

export default function AnnouncementBanner() {
  const pathname = usePathname();
  const [dismissed, setDismissed] = useState(false);
  /** Offset while a finger is on the notice; null when nothing is dragging. */
  const [dragY, setDragY] = useState<number | null>(null);
  /** Set once dismissal is committed to, while the exit plays out. */
  const [closing, setClosing] = useState(false);
  const dragStart = useRef<{
    y: number;
    pointerId: number;
    captured: boolean;
  } | null>(null);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (exitTimer.current) clearTimeout(exitTimer.current);
    },
    [],
  );

  if (!ANNOUNCEMENT || dismissed || !showsAnnouncement(pathname)) return null;

  const { id, eyebrow, message, action, tone } = ANNOUNCEMENT;
  const toneClasses = TONES[tone];

  const commitDismissal = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(ANNOUNCEMENT_STORAGE_KEY, id);
    } catch {
      // Session storage unavailable (private-mode restrictions, cookies
      // blocked). The card still closes for this page view; it just comes back
      // on the next load, which is the honest failure direction for a notice.
    }
  };

  /**
   * Both ways out — pressing the tab and swiping down — run the exit first and
   * commit on a timer rather than on transitionend, which never fires if the
   * transition is interrupted or optimised away and would strand the notice
   * on screen for good.
   */
  const startDismiss = () => {
    if (closing) return;
    setClosing(true);
    exitTimer.current = setTimeout(commitDismissal, EXIT_MS);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    // Mouse sits this out deliberately: a click-drag across a card of text
    // fights text selection, and this gesture is asking for a finger.
    if (closing || event.pointerType === "mouse") return;
    dragStart.current = {
      y: event.clientY,
      pointerId: event.pointerId,
      captured: false,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const start = dragStart.current;
    if (start?.pointerId !== event.pointerId) return;
    const distance = event.clientY - start.y;

    // Capture only once the finger has actually travelled, never on the way
    // down. Capturing on pointerdown re-targets the click that follows, which
    // would break tapping the tab and the action button — the two things most
    // people touch this notice for.
    if (!start.captured) {
      if (Math.abs(distance) < DRAG_SLOP) return;
      start.captured = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    // Down tracks the finger exactly; up is heavily damped, since there is
    // nothing above for the notice to go to and it should feel like it knows.
    setDragY(distance > 0 ? distance : distance / 6);
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLElement>) => {
    const start = dragStart.current;
    if (start?.pointerId !== event.pointerId) return;
    dragStart.current = null;
    const distance = event.clientY - start.y;
    setDragY(null);
    // A press that never became a drag is a tap; leave it to the click.
    if (start.captured && distance >= SWIPE_CLOSE_DISTANCE) startDismiss();
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
          and would otherwise swallow clicks on whatever sits behind it.

          The side padding does not step down on a narrow screen the way the
          vertical padding does. The card's border is black and the page it
          floats over is near-black, so a thin gutter reads as no gutter at
          all — the border runs into the background and the card loses its
          edge. The sides hold 1.5rem everywhere; only the top and bottom
          tighten on mobile, where vertical space is the scarce one.

          The right padding carries an extra --block-shadow-xl because the
          block shadow falls outside the card's box: mx-auto would centre the
          box and leave the thing you actually see sitting half the offset
          left of centre, and on a narrow screen, where the card fills the
          gutter, the shadow would eat half the right-hand gap. Widening the
          gutter on that side by exactly the offset squares both — the card
          shifts left by half of it when centred, and the shadow lands in the
          space that was added for it when it does not. Reading the token
          rather than a literal keeps it true if the offset changes. */}
      <div
        data-slot="announcement-banner"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-6 pt-4 pr-[calc(1.5rem+var(--block-shadow-xl))] pb-[max(1rem,env(safe-area-inset-bottom))] md:pt-6 md:pb-[max(1.5rem,env(safe-area-inset-bottom))]"
      >
        {/* Scrim. It grounds the notice against whatever is scrolling under it
            and gives the card's black border something other than page text
            to sit on.

            The blur has to fade out, and `backdrop-filter` takes no gradient —
            so the gradient goes on a `mask-image` instead, which is applied to
            this element's composited result and therefore fades the blur and
            the darkening together, in one pass. Tailwind emits the -webkit-
            prefixed property alongside the standard one, so old Safari is
            covered without a second class.

            Height: it hangs 4/6 above the gutter's box, which is the same step
            as the gutter's own padding — so the distance it reaches past the
            top of the notice is the gap below it, mirrored. The extra also
            covers the tab, which hangs above the gutter's box and would
            otherwise sit on the scrim's hard edge.

            No z-index: like the tab, it just takes its place in DOM order —
            first child, so both the card and the tab paint over it. */}
        <div
          aria-hidden
          style={
            closing
              ? { opacity: 0, transition: `opacity ${EXIT_MS}ms ease-out` }
              : undefined
          }
          className="animate-in fade-in pointer-events-none absolute inset-x-0 -top-4 bottom-0 bg-black/50 [mask-image:linear-gradient(to_top,#000_0%,#000_20%,transparent_100%)] duration-500 supports-backdrop-filter:backdrop-blur-sm motion-reduce:animate-none md:-top-6"
        />

        {/* The landmark wraps card AND tab, so a screen reader reads the
            eyebrow as part of the notice rather than as loose text beside it.
            It also carries the entrance animation, so the tab rises with the
            card instead of being left behind, and it must NOT clip: the tab
            hangs above its box. */}
        <aside
          aria-label="Club announcement"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          style={{
            translate: closing
              ? "0 140%"
              : dragY !== null
                ? `0 ${dragY}px`
                : undefined,
            opacity: closing ? 0 : undefined,
            // Inline, so it beats every utility. While a finger is down there
            // must be no transition at all or the notice lags behind it; and
            // Tailwind's duration-* would collide with the entrance
            // animation's own duration token on this same element.
            transition:
              dragY === null
                ? `translate ${EXIT_MS}ms ease-out, opacity ${EXIT_MS}ms ease-out`
                : "none",
          }}
          /* touch-none hands us the vertical drag instead of scrolling the
             page with it — the same trade Radix Toast makes. It costs the
             ability to scroll by starting the drag on the notice itself. */
          className="animate-in slide-in-from-bottom-6 fade-in pointer-events-auto relative mx-auto max-w-4xl touch-none duration-500 motion-reduce:animate-none"
        >
          {/* Template literal, not cn(): tailwind-merge files `shadow-block-lg`
              and `shadow-rose-600` under one `shadow` group and keeps only the
              last, which silently deletes the block shadow and leaves a colour
              with nothing to colour. Every other block-shadow call site on the
              site (EventCard, PartnersSection, LeaderCard) concatenates for
              the same reason. There is nothing here for a merge to resolve
              anyway — no caller passes a className in. */}
          <div
            className={`shadow-block-outlined-xl relative isolate flex flex-col gap-2.5 overflow-hidden rounded-lg border-2 border-black px-4 py-3 text-black sm:flex-row sm:items-center sm:gap-4 ${toneClasses.card} ${toneClasses.blockShadow}`}
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

            <Link
              href={action.href}
              {...(action.external
                ? { target: "_blank", rel: "noopener noreferrer" }
                : {})}
              className={cn(
                "hover:shadow-block-[3px] transition-lift flex shrink-0 items-center gap-2 self-end rounded-sm border-2 border-black bg-black px-3.5 py-1.5 text-sm font-semibold text-white hover:-translate-x-0.75 hover:-translate-y-0.75 sm:self-auto",
                toneClasses.blockShadow,
              )}
            >
              {action.label}
              {action.external ? (
                <ArrowSquareOutIcon className="size-4" />
              ) : (
                <ArrowRightIcon weight="bold" className="size-4" />
              )}
            </Link>
          </div>

          {/* The tab, which is also the dismiss control — the X lives here
              rather than in the action row, so the notice has exactly one
              close affordance and the row is left to the one thing it wants
              you to do.

              It comes AFTER the card in the DOM so its opaque fill
              paints over the card's top border, erasing exactly the span it
              covers, and `translate-y` drops it 2px into the card so that
              erased band is precisely the border's width — no seam, no
              doubled line. `border-b-0` leaves its own outline open at the
              bottom, so the two borders read as one silhouette.

              No block shadow here on purpose: the card's falls down and to the
              right, away from the tab, while a shadow on the tab itself would
              land squarely on the card's face. */}
          <button
            type="button"
            onClick={startDismiss}
            /* The eyebrow is inside the control, so the label has to carry
               both — "Now open, button" would say nothing about what pressing
               it does, and a bare "Dismiss announcement" would drop the
               eyebrow from the accessible name entirely. */
            aria-label={`${eyebrow} — dismiss announcement`}
            className={cn(
              "group/tab absolute bottom-full left-4 flex translate-y-[2px] items-center gap-1.5 rounded-t-lg border-2 border-b-0 border-black px-2.5 py-1.5 transition-colors focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none",
              toneClasses.chip,
              toneClasses.chipHover,
            )}
          >
            {/* `fill` rather than `bold`: the label beside it is extrabold and
                Phosphor's stroke weights top out lighter than that.
                aria-hidden because the button's label already says
                "dismiss". */}
            <XIcon
              aria-hidden
              weight="fill"
              className="size-3 transition-transform group-hover/tab:scale-125"
            />
            <span className="font-display text-[0.7rem] font-extrabold tracking-widest uppercase">
              {eyebrow}
            </span>
          </button>
        </aside>
      </div>
    </>
  );
}
