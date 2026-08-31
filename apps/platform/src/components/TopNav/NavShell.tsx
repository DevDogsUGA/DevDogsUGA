"use client";

import { NavigationMenu } from "radix-ui";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { NAV_ARROW, NAV_SURFACE } from "./navPanel";
import { useMenuBox } from "./useMenuBox";

/** The item values the navbar's top tier can hold. */
export const DOCS_MENU = "docs";
export const PROFILE_MENU = "profile";

interface NavShellContext {
  /** The open item, or "" when the bar is closed. */
  value: string;
  /**
   * A ref for a top-tier panel to hand its Content. Radix hoists that Content
   * into the shared viewport a couple of commits after the menu opens, and
   * those commits happen below this component, which re-renders nothing that
   * could measure the result. The ref firing is the shell's only word that its
   * panel has arrived.
   */
  panelRef: (node: HTMLElement | null) => void;
}

const Context = createContext<NavShellContext | null>(null);

/**
 * Read the navbar's open item. The profile menu needs it, to clear its own
 * sub-menu when the menu it hangs off closes.
 */
export function useNavShell() {
  const context = useContext(Context);
  if (context === null) {
    throw new Error("useNavShell must be used inside <NavShell>");
  }
  return context;
}

/** The ref a top-tier panel gives its Content, so the shell can measure it. */
export function useNavPanelRef() {
  return useNavShell().panelRef;
}

/**
 * The navbar's one menu root, and the single viewport every top-tier panel
 * renders into.
 *
 * One viewport rather than a panel per trigger, so the panels read as one
 * surface being re-aimed: hover Docs and it sits under Docs, hover the avatar
 * and the same box travels there, resizing on the way. Radix does the hoisting,
 * so a Content declared beside its Trigger renders inside the Viewport,
 * wherever that is.
 *
 * What Radix does NOT do is place the viewport horizontally. That is the
 * positioner below, and `useMenuBox` is where its numbers come from. See the
 * note there on why they are measured off the panel rather than read from
 * Radix's variables.
 *
 * The viewport is also the card: the border, the fill, the shadow. Put the
 * surface on the panels instead and the box that travels and resizes is
 * invisible, so a viewer sees one card vanish and a differently sized one
 * appear elsewhere. The panels inside it are transparent and clipped. See
 * navPanel.
 *
 * Two smaller things. The arrow is placed by hand from the same measurement,
 * not left to Radix's Indicator, which cannot render until an effect and a
 * ResizeObserver have found its trigger and so started its fade a frame or two
 * after the viewport had begun folding; see NAV_ARROW. And the viewport
 * grows a lip above itself: the panel sits clear of the bar, and the pointer
 * must never cross a gap it can lose the menu in. Radix cancels its close timer
 * on the viewport's pointerenter, so a lip that is part of the viewport's own
 * box makes that gap crossable. The trigger covers the other half of it, and
 * the profile menu covers the end of the bar. See NavMenuTrigger and the band
 * in ProfilePopover.
 */
export default function NavShell({ children }: { children: ReactNode }) {
  const [value, setValue] = useState("");
  const [revision, panelChanged] = useReducer((n: number) => n + 1, 0);
  const rootRef = useRef<HTMLElement>(null);
  const panelRef = useCallback(() => panelChanged(), [panelChanged]);
  const { box, travelling, settle } = useMenuBox({
    containerRef: rootRef,
    value,
    triggerSelector: "[data-nav-trigger]",
    revision,
    place: true,
  });

  const context = useMemo(() => ({ value, panelRef }), [value, panelRef]);

  return (
    <Context.Provider value={context}>
      <NavigationMenu.Root
        ref={rootRef}
        value={value}
        onValueChange={setValue}
        aria-label="Main"
        className="relative"
      >
        <NavigationMenu.List className="flex h-16 items-center gap-1 px-4 md:px-6">
          {children}
        </NavigationMenu.List>

        {/* Spans the bar so the anchor offset is measured in the same
            coordinate space it is applied in, and lets nothing through. An
            inert full-width strip under the header would otherwise eat the top
            of every page. */}
        <div className="pointer-events-none absolute inset-x-0 top-full">
          {/* Hidden until it has been measured. The measurement lands in the
              same pre-paint sequence that mounts the panel, so this should
              never be seen. It is here so an unmeasured panel stays out of
              sight rather than parking against the left of the window. */}
          <div
            data-travelling={travelling || undefined}
            style={{
              left: box === null ? 0 : `${box.left}px`,
              visibility: box === null ? "hidden" : undefined,
              // Published for anything inside a panel that needs to reach the
              // window's edge rather than the panel's, such as the profile
              // menu's hover band. The distance varies with the breakpoint's
              // gutter and with what sits right of the trigger, so it is
              // measured rather than assumed.
              ["--nav-right-gap" as string]:
                box === null ? "0px" : `${box.rightGap}px`,
              // And where that band must stop on the way in. A panel is wider
              // than the group of controls it opens from, so a band running
              // the panel's full width reaches back past them and over the
              // navigation links, which are triggers of their own and would
              // stop responding to the pointer entirely.
              ["--nav-band-left" as string]:
                box === null
                  ? "0px"
                  : `${Math.max(0, box.rowLeft - box.left)}px`,
            }}
            className="absolute top-2 transition-none data-[travelling]:transition-[left] data-[travelling]:duration-200 data-[travelling]:ease-out"
          >
            <NavigationMenu.Viewport
              data-slot="nav-viewport"
              data-travelling={travelling || undefined}
              onAnimationEnd={settle}
              style={
                box === null
                  ? undefined
                  : { width: `${box.width}px`, height: `${box.height}px` }
              }
              // The bridge is a pseudo-element rather than padding. Padding
              // would have been tidier, but a panel positioned against `top-0`
              // resolves that against the padding box, whose top edge is inside
              // the border and above the padding. The padding widens the box
              // without moving the panel down off the bar, so the gap it was
              // meant to fill stays exactly where it was.
              className={`data-[state=closed]:animate-nav-fold-out data-[state=open]:animate-nav-fold-in pointer-events-auto relative origin-top transition-none before:absolute before:inset-x-0 before:-top-2 before:h-2 before:content-[''] data-[travelling]:transition-[width,height] data-[travelling]:duration-200 data-[travelling]:ease-out ${NAV_SURFACE}`}
            />
          </div>

          {/* After the strip, so it paints over the card's top edge. It stays
              mounted across opens, unlike the Radix Indicator it replaces, so
              its state flips in the very commit that opens or closes the
              viewport and the two fade as one. Hidden with the strip until the
              first measurement; see NAV_ARROW for the rest. */}
          <span
            aria-hidden
            data-slot="nav-indicator"
            data-state={value === "" ? "hidden" : "visible"}
            data-travelling={travelling || undefined}
            style={{
              left: box === null ? 0 : `${box.triggerX}px`,
              visibility: box === null ? "hidden" : undefined,
            }}
            className={NAV_ARROW}
          />
        </div>
      </NavigationMenu.Root>
    </Context.Provider>
  );
}
