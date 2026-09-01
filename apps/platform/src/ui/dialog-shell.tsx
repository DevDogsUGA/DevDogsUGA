"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ComponentProps,
  type ReactNode,
} from "react";
import { ArrowLeftIcon } from "@phosphor-icons/react/ssr";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "~/ui/dialog";

export type DialogTone = "light" | "dark";

/**
 * How a paired dialog takes part in the pair. A `primary` shifts left to make
 * room when its `aside` opens; an `aside` tells the primary it is open, and
 * is dealt out from behind it. Below the pair breakpoint the aside simply
 * stacks on top as any nested dialog does, with a way back instead of an X.
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
  /** What the stacked aside's back button says it returns to. */
  backLabel?: string;
  /** Override the focus target selected when the dialog opens. */
  onOpenAutoFocus?: ComponentProps<typeof DialogContent>["onOpenAutoFocus"];
}

/**
 * The shared frame for this site's big dialogs. Overlay, panel, sizing, and a
 * fixed header over a scrolling body. Nothing in here knows what it is framing.
 * The directions dialog and the meeting dialog both hand it a header and a
 * body, so the overlay and panel exist once, in one place.
 *
 * The panel caps at 85dvh and hides its own overflow; the body is the scroll
 * container instead of the panel, which keeps the header (and the close button,
 * absolutely positioned against the panel) in view however tall the content is.
 * `dvh` rather than `vh` because mobile browsers shrink the visual viewport as
 * their chrome slides in, and `vh` would leave the bottom of the dialog under
 * the address bar.
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
 * mounted. From `lg` up (the same 64rem the layout breakpoint uses, read
 * through `matchMedia` so the two cannot disagree) a `primary` and its
 * `aside` sit side by side; the panels shrink to half the viewport less a
 * margin when 36rem each will not fit. The primary hears the aside open
 * through {@link PairContext} and transitions `left` by half a panel plus half
 * the gap, with a small tilt. The aside is placed the same distance to the
 * right and dealt out from behind it, travelling a full panel-and-gap, exactly
 * the primary's resting spot, with a rotation that swings through and settles
 * like a card pulled from a deck. The primary sits one z-index above it at that
 * width, so the aside is genuinely *behind* it as it emerges. Closing runs the
 * deal in reverse.
 *
 * Side by side, the aside is NON-modal. That is what lets the primary stay
 * live, since a modal aside would make Radix put `pointer-events: none` on the
 * primary, and it is why the dismiss rules are written by hand below:
 *  - a click inside either panel keeps both open (each panel's outside-click
 *    handler ignores targets inside any dialog content);
 *  - a click on the overlay closes both, because it is outside both, and each
 *    closes itself. Nothing closes the other, so a route dialog's
 *    `router.back()` runs exactly once;
 *  - the primary's own close button closes both, since the aside lives in the
 *    primary's body and unmounts with it.
 *
 * Stacked (below `lg`), the aside is an ordinary modal nested dialog: the
 * primary is inert beneath it, the overlay closes only the aside, and the X is
 * replaced by a back button that says where closing goes.
 */
export default function DialogShell({
  open,
  onOpenChange,
  trigger,
  header,
  children,
  tone = "light",
  pair,
  backLabel = "Back",
  onOpenAutoFocus,
}: Props) {
  const wide = useSideBySide();
  const isAside = pair === "aside";
  const isPrimary = pair === "primary";
  // Pairing is a fact about the viewport, not about the props: below `lg`
  // a paired dialog is just a nested one.
  const paired = pair !== undefined && wide;

  const [asideOpen, setAsideOpen] = useState(false);
  const notifyPrimary = useContext(PairContext);

  // An aside reports its own open state upward; the primary only ever hears
  // from one aside, so a plain setter is the whole protocol. Unmounting
  // counts as closing, or a primary would stay shifted after its aside's
  // route went away underneath it.
  useEffect(() => {
    if (!isAside || notifyPrimary === null) return;
    notifyPrimary(open === true);
    return () => notifyPrimary(false);
  }, [isAside, notifyPrimary, open]);

  const t = TONES[tone];
  const role = isPrimary ? PRIMARY : isAside ? ASIDE : NONE;
  const stackedAside = isAside && !paired;

  const content = (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      modal={!(isAside && paired)}
    >
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent
        data-aside={isPrimary ? asideOpen : undefined}
        // Stacked, the aside's way out is the back button below, not an X.
        showCloseButton={!stackedAside}
        onOpenAutoFocus={onOpenAutoFocus}
        onInteractOutside={paired ? keepPairOpen : undefined}
        overlayClassName={t.overlay}
        className={`flex max-h-[85dvh] w-full flex-col gap-4 overflow-hidden p-5 ring-0 sm:max-w-xl ${t.panel} ${role.panel}`}
      >
        {stackedAside ? <div className="pr-24">{header}</div> : header}
        <div className="-mx-5 grid min-h-0 gap-4 overflow-y-auto px-5">
          {children}
        </div>
        {stackedAside && (
          <DialogClose asChild>
            <button type="button" className={t.back}>
              <ArrowLeftIcon /> {backLabel}
            </button>
          </DialogClose>
        )}
      </DialogContent>
    </Dialog>
  );

  // Only a primary provides. An aside inside an aside would otherwise report
  // to the wrong dialog.
  return isPrimary ? (
    <PairContext.Provider value={setAsideOpen}>{content}</PairContext.Provider>
  ) : (
    content
  );
}

/** How a primary hears its aside open and close. Null outside any pair. */
const PairContext = createContext<((open: boolean) => void) | null>(null);

/**
 * Side by side from `lg`. Tailwind's `lg` is 64rem; the query says the same
 * thing in the same unit so the CSS classes below and this hook flip on the
 * same pixel. Server-rendered as false: a dialog only opens on the client, and
 * the first client snapshot corrects it before anyone can click.
 */
const PAIR_QUERY = "(min-width: 64rem)";

function subscribeToPairQuery(onChange: () => void) {
  const query = window.matchMedia(PAIR_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function useSideBySide(): boolean {
  return useSyncExternalStore(
    subscribeToPairQuery,
    () => window.matchMedia(PAIR_QUERY).matches,
    () => false,
  );
}

/**
 * Outside-interaction handler for both panels of an open pair: anything that
 * lands inside a dialog's content, meaning the other panel, is not "outside"
 * in any sense the user means, so it is swallowed. Anything else (the overlay)
 * falls through to Radix's default and dismisses this panel; the other panel
 * gets the same event and dismisses itself.
 */
function keepPairOpen(event: {
  detail: { originalEvent: Event };
  preventDefault: () => void;
}) {
  const target = event.detail.originalEvent.target;
  if (
    target instanceof Element &&
    target.closest('[data-slot="dialog-content"]') !== null
  ) {
    event.preventDefault();
  }
}

/**
 * The pair geometry lives in three custom properties set on both panels:
 * the panel width (36rem, or half the viewport less a margin when that will
 * not fit; at `lg` itself two 36rem panels would need 73rem of a 64rem screen),
 * how far each panel sits off centre, and how far the aside travels as it is
 * dealt. The keyframes in globals.css read `--pair-travel`.
 *
 * Spelled out literally in every class: Tailwind finds utilities by scanning
 * source text, so nothing here may be interpolated.
 */
const PAIR_VARS =
  "lg:[--pair-panel:min(36rem,50vw_-_1.5rem)] lg:[--pair-offset:calc(var(--pair-panel)_/_2_+_0.5rem)] lg:[--pair-travel:calc(var(--pair-panel)_+_1rem)]";

const TONES = {
  light: {
    panel: "rounded-sm border-2 border-black bg-white text-black",
    overlay: "",
    back: "hover:shadow-block-md transition-lift absolute top-3 right-3 flex items-center gap-1.5 rounded-sm border-2 border-black bg-white px-2.5 py-1 text-xs font-semibold text-black hover:-translate-x-0.5 hover:-translate-y-0.5",
  },
  dark: {
    panel:
      "rounded-xl border-2 border-mauve-800 bg-mauve-950 text-white shadow-2xl shadow-black/60",
    overlay: "bg-black/40",
    back: "absolute top-3 right-3 flex items-center gap-1.5 rounded-lg border border-mauve-600 bg-mauve-800 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:border-white",
  },
} satisfies Record<
  DialogTone,
  { panel: string; overlay: string; back: string }
>;

const NONE = { panel: "" };

const PRIMARY = {
  panel: `${PAIR_VARS} lg:z-[51] lg:transition-[left,max-width] lg:[transition-duration:420ms] lg:ease-out lg:data-[aside=true]:left-[calc(50%_-_var(--pair-offset))] lg:data-[aside=true]:max-w-(--pair-panel) lg:data-[aside=true]:animate-pair-primary`,
};

const ASIDE = {
  panel: `${PAIR_VARS} lg:left-[calc(50%_+_var(--pair-offset))] lg:max-w-(--pair-panel) lg:data-open:animate-pair-aside-in lg:data-closed:animate-pair-aside-out`,
};
