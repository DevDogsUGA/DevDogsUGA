"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Dialog, DialogContent, DialogTrigger } from "~/ui/dialog";

export type DialogTone = "light" | "dark";

/**
 * How a paired dialog takes part in the pair. A `primary` shifts left to make
 * room when its `aside` opens; an `aside` tells the primary it is open, and
 * slides out from behind it. Neither means anything below the pair
 * breakpoint, where the aside simply stacks on top as any nested dialog does.
 */
export type DialogPairRole = "primary" | "aside";

interface Props {
  /** Omit both to let the dialog own its state (a trigger-opened dialog). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The element that opens it; none when a route decides that instead. */
  trigger?: ReactNode;
  /**
   * The title block: a `DialogTitle` and usually a `DialogDescription`, which
   * the caller supplies because it is the one content-specific part of the
   * frame. It stays put while the body scrolls, so the dialog always says what
   * it is. Radix wants a `DialogTitle` inside the content for the accessible
   * name, so this prop is required rather than optional.
   */
  header: ReactNode;
  /** The body below the header; the only part that scrolls. */
  children: ReactNode;
  /** The marketing plate's white panel, or the console's dark one. */
  tone?: DialogTone;
  /** See {@link DialogPairRole}. Omit for a dialog that stands alone. */
  pair?: DialogPairRole;
}

/**
 * The shared frame for this site's big dialogs: overlay, panel, sizing, and a
 * fixed header over a scrolling body. Nothing in here knows what it is framing
 * — the directions dialog and the meeting dialog both hand it a header and a
 * body — so the overlay and panel exist once, in one place.
 *
 * The panel caps at 85dvh and hides its own overflow; the body is the scroll
 * container instead of the panel, which is what keeps the header (and the
 * close button, which is absolutely positioned against the panel) in view no
 * matter how tall the content is. `dvh` rather than `vh` because mobile
 * browsers shrink the visual viewport as their chrome slides in, and `vh`
 * would leave the bottom of the dialog under the address bar.
 *
 * The two classes worth not deleting:
 *  - `min-h-0` on the body: a flex child's default `min-height: auto` refuses
 *    to shrink below its content, so without it the body would push past the
 *    panel's max height and get clipped by `overflow-hidden` instead of
 *    scrolling.
 *  - `-mx-5 px-5`: the scroll container reaches the panel's edges and puts the
 *    padding inside itself, so the scrollbar sits against the panel edge where
 *    it did when the panel itself scrolled, rather than floating 20px in.
 *
 * ## Pairs
 *
 * A dialog opened from inside another one is a nested Radix dialog: both stay
 * mounted, the inner one on top. From 76rem wide up, a `primary` and its
 * `aside` instead sit side by side. The primary keeps its centre until the
 * aside reports itself open (through {@link PairContext}), then transitions
 * `left` by half a panel plus half the gap; the aside is placed the same
 * distance to the right and enters by sliding a full panel-and-gap from the
 * left — which is exactly the primary's resting spot — while scaling and
 * fading up. The primary sits one z-index above it at that width, so the
 * aside is genuinely *behind* it as it emerges. Closing runs the same in
 * reverse. The aside's overlay goes transparent at that width too, since the
 * primary's is already there and a second would double-dim the page.
 *
 * Below the breakpoint none of those classes apply and the nested dialog
 * behaves as it always did.
 */
export default function DialogShell({
  open,
  onOpenChange,
  trigger,
  header,
  children,
  tone = "light",
  pair,
}: Props) {
  const [asideOpen, setAsideOpen] = useState(false);
  const notifyPrimary = useContext(PairContext);

  // An aside reports its own open state upward; the primary only ever hears
  // from one aside, so a plain setter is the whole protocol. Unmounting
  // counts as closing, or a primary would stay shifted after its aside's
  // route went away underneath it.
  useEffect(() => {
    if (pair !== "aside" || notifyPrimary === null) return;
    notifyPrimary(open === true);
    return () => notifyPrimary(false);
  }, [pair, notifyPrimary, open]);

  const t = TONES[tone];
  const role = pair === "primary" ? PRIMARY : pair === "aside" ? ASIDE : NONE;

  const content = (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent
        data-aside={pair === "primary" ? asideOpen : undefined}
        overlayClassName={`${t.overlay} ${role.overlay}`}
        className={`flex max-h-[85dvh] w-full flex-col gap-4 overflow-hidden p-5 ring-0 sm:max-w-xl ${t.panel} ${role.panel}`}
      >
        {header}
        <div className="-mx-5 grid min-h-0 gap-4 overflow-y-auto px-5">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );

  // Only a primary provides — an aside inside an aside would otherwise report
  // to the wrong dialog.
  return pair === "primary" ? (
    <PairContext.Provider value={setAsideOpen}>{content}</PairContext.Provider>
  ) : (
    content
  );
}

/** How a primary hears its aside open and close. Null outside any pair. */
const PairContext = createContext<((open: boolean) => void) | null>(null);

/**
 * Two `sm:max-w-xl` panels (36rem each) and a 1rem gap need 73rem; the
 * `min-[76rem]` gate leaves a little air on either side, and is written as a
 * bare arbitrary breakpoint because no theme breakpoint sits near it. The
 * offsets are half a panel plus half the gap (18.5rem) for where each panel
 * rests, and a whole panel plus the gap (37rem) for how far the aside
 * travels as it emerges. Spelled out literally in every class — Tailwind
 * finds utilities by scanning source text, so nothing here may be
 * interpolated.
 */
const TONES = {
  light: {
    panel: "rounded-sm border-2 border-black bg-white text-black",
    overlay: "",
  },
  dark: {
    panel:
      "rounded-xl border-2 border-mauve-800 bg-mauve-950 text-white shadow-2xl shadow-black/60",
    overlay: "bg-black/40",
  },
} satisfies Record<DialogTone, { panel: string; overlay: string }>;

const NONE = { panel: "", overlay: "" };

const PRIMARY = {
  panel:
    "min-[76rem]:z-[51] min-[76rem]:transition-[left] min-[76rem]:[transition-duration:300ms] min-[76rem]:ease-out min-[76rem]:data-[aside=true]:left-[calc(50%-18.5rem)]",
  overlay: "",
};

const ASIDE = {
  panel:
    "min-[76rem]:left-[calc(50%+18.5rem)] min-[76rem]:duration-300 min-[76rem]:ease-out min-[76rem]:data-open:slide-in-from-left-[37rem] min-[76rem]:data-open:zoom-in-90 min-[76rem]:data-closed:slide-out-to-left-[37rem] min-[76rem]:data-closed:zoom-out-90",
  overlay: "min-[76rem]:bg-transparent min-[76rem]:backdrop-blur-none",
};
