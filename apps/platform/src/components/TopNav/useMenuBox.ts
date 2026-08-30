"use client";

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

/** Where the open panel is and how big it is, in its container's coordinates. */
export interface MenuBox {
  left: number;
  /** Only meaningful for a centred tier; zero everywhere else. */
  top: number;
  width: number;
  height: number;
  /** From the panel's right edge to the container's, for anything that has to
   * reach the edge of the window rather than the edge of the panel. */
  rightGap: number;
  /**
   * The left edge of the row the open trigger sits in, in the same
   * coordinates as `left`. A panel is often wider than its own group of
   * controls, so anything that wants to cover "the trigger's end of the bar"
   * has to stop here rather than at the panel's edge.
   */
  rowLeft: number;
  /**
   * The middle of the open trigger, measured down from the container's top.
   * Only a vertical tier needs it, to aim an arrow at the row it came from.
   */
  triggerY: number;
}

interface Options {
  /** The tier's own root, which its triggers and its panel live inside. */
  containerRef: RefObject<HTMLElement | null>;
  /** The open item's value, or "" when the tier is closed. */
  value: string;
  /**
   * Marks this tier's triggers. Tiers nest, so a selector shared between them
   * would let the outer one measure the inner one's trigger.
   */
  triggerSelector: string;
  /**
   * Bumped whenever a panel of this tier mounts or unmounts, which is the
   * only reliable moment to measure one. See the note on the measuring effect.
   */
  revision: number;
  /** Whether this tier positions itself. A right-anchored tier does not. */
  place?: boolean;
  /**
   * Centre the panel against its container's height rather than hanging it
   * from the top. Clamped, because a panel taller than what it is centred on
   * would otherwise rise out of the top of it and into the navbar.
   */
  centre?: boolean;
  /** How close a placed panel may come to the container's edges. */
  margin?: number;
}

/**
 * The size and position of whichever panel is open, measured from the panel
 * itself.
 *
 * Radix publishes the same numbers as `--radix-navigation-menu-viewport-*`,
 * and they are the wrong numbers to build on. It measures in a state update a
 * commit after the panel mounts, so on the opening frame the variables are
 * absent: anything derived from them starts at a fallback and corrects itself
 * once the real values land. That one bug had two faces. A panel anchored by
 * its right edge jumped sideways by its own width, and a panel whose box grew
 * from zero dragged the origin of its fold with it, so the fold looked like a
 * sideways lurch.
 *
 * Measuring here instead is a commit earlier. The panel is already in the DOM
 * when this runs, at its natural width, because its width is written in its
 * own classes rather than inferred; `offsetWidth` is therefore final on the
 * first frame and every frame after. The open trigger names its panel through
 * `aria-controls`, which is exactly the panel Radix is about to show. During a
 * hand-over, when both are mounted, that is unambiguous in a way that querying
 * for a panel is not.
 *
 * `travelling` is the same gate as before, and the reason both tiers need it:
 * a size or position transition is only honest between two panels the viewer
 * watched in one sequence. Running it on an opening menu animates the box out
 * from nothing, which reads as a wipe rather than an appearance. It is off
 * until the fold has finished, which is `settle`.
 */
export function useMenuBox({
  containerRef,
  value,
  triggerSelector,
  revision,
  place = false,
  centre = false,
  margin = 12,
}: Options) {
  const [box, setBox] = useState<MenuBox | null>(null);
  const [travelling, setTravelling] = useState(false);
  const previousValue = useRef("");
  const currentValue = useRef("");
  const measured = useRef<MenuBox | null>(null);

  const measure = useCallback(() => {
    const container = containerRef.current;
    if (container === null) return;

    const trigger = container.querySelector<HTMLElement>(
      `${triggerSelector}[data-state="open"]`,
    );
    // Radix hands the trigger its panel's id while it is open, so this is the
    // panel about to be shown rather than whichever one is still fading out.
    const panelId = trigger?.getAttribute("aria-controls");
    const panel =
      panelId === null || panelId === undefined
        ? null
        : document.getElementById(panelId);
    if (trigger === null || panel === null) return;

    // The panel fills its viewport, so measuring the panel would be measuring
    // the answer we are trying to work out. The sizer inside it is the part
    // with a width of its own, and its height follows from that width, so it
    // is the same number on every frame no matter what the viewport is doing.
    const sizer = panel.querySelector<HTMLElement>("[data-nav-sizer]") ?? panel;
    const width = sizer.offsetWidth;
    const height = sizer.offsetHeight;

    let left = 0;
    let rowLeft = 0;
    if (place) {
      const rect = trigger.getBoundingClientRect();
      const containerLeft = container.getBoundingClientRect().left;
      const row = trigger.closest("li");
      rowLeft =
        row === null ? 0 : row.getBoundingClientRect().left - containerLeft;
      // The trigger's own edge, never the panel's: "end" lines the panel's
      // right edge up with the trigger's right edge.
      const aligned =
        (trigger.dataset.navAlign === "end" ? rect.right - width : rect.left) -
        containerLeft;
      // Now that the width is a real measurement rather than a guess, keeping
      // a wide panel on screen is a clamp rather than a hazard.
      left = Math.max(
        margin,
        Math.min(aligned, container.clientWidth - width - margin),
      );
    }

    // Centred against the container, but never above it. A sub-panel taller
    // than the card it belongs to has no centred position that does not put
    // its top edge inside the navbar, so past that point it hangs from the top
    // and grows downward, which is the only direction with room in it.
    const top = centre
      ? Math.max(0, Math.round((container.offsetHeight - height) / 2))
      : 0;

    const triggerRect = trigger.getBoundingClientRect();
    const triggerY = centre
      ? Math.round(
          triggerRect.top +
            triggerRect.height / 2 -
            container.getBoundingClientRect().top,
        )
      : 0;

    const next = {
      left,
      top,
      width,
      height,
      rightGap: place ? container.clientWidth - left - width : 0,
      rowLeft,
      triggerY,
    };

    const last = measured.current;
    if (
      last !== null &&
      last.left === next.left &&
      last.top === next.top &&
      last.width === next.width &&
      last.height === next.height &&
      last.rightGap === next.rightGap &&
      last.rowLeft === next.rowLeft &&
      last.triggerY === next.triggerY
    ) {
      return;
    }
    measured.current = next;
    setBox(next);
  }, [containerRef, triggerSelector, place, centre, margin]);

  useLayoutEffect(() => {
    const wasOpen = previousValue.current !== "";
    previousValue.current = value;
    currentValue.current = value;
    // Closed. Keep the last box so the fold-out plays where the panel is, but
    // make sure the next open arrives rather than sliding in from here.
    setTravelling(value === "" ? false : wasOpen);
  }, [value]);

  // Keyed on the panel's arrival, not on the value that asked for it.
  //
  // A panel is not in the DOM on the commit that opens it. Radix mounts the
  // viewport only while the menu is open, and a panel can only be hoisted into
  // a viewport that already exists, so opening takes three commits: the value
  // changes, the viewport mounts and publishes itself, and only then does the
  // panel render inside it. Worse, the last two are state updates inside
  // Radix's own provider, which is a DESCENDANT, so nothing re-renders the
  // component holding this hook, and an effect of its own, however it is
  // keyed, never runs again to see the panel appear.
  //
  // Hence `revision`: every panel hands its Content a ref, and a ref callback
  // fires during the commit that mounts it. That is a signal travelling the
  // right way up the tree, and it arrives in the layout phase, before the
  // browser is given anything to paint.
  useLayoutEffect(() => {
    if (value === "") return;
    measure();
  }, [value, revision, measure]);

  // A panel's width is written in its classes, so it only changes when a
  // breakpoint does. Re-measuring on resize is what keeps a menu left open
  // across one from being placed by numbers that no longer describe it.
  useLayoutEffect(() => {
    if (value === "") return;
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [value, measure]);

  /**
   * Marks the fold finished, after which the box may animate between panels.
   * Panels inside animate too and their events bubble, hence the target check;
   * the fold-out's own end must not re-arm a menu that is closing.
   */
  const settle = useCallback(
    (event: { target: unknown; currentTarget: unknown }) => {
      if (event.target !== event.currentTarget) return;
      if (currentValue.current === "") return;
      setTravelling(true);
    },
    [],
  );

  return { box, travelling, settle };
}
