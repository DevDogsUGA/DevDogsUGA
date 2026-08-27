"use client";

import { NavigationMenu } from "radix-ui";
import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/** The item values the navbar's top tier can hold. */
export const DOCS_MENU = "docs";
export const PROFILE_MENU = "profile";

interface NavShellContext {
  /** The open item, or "" when the bar is closed. */
  value: string;
  open: (value: string) => void;
}

const Context = createContext<NavShellContext | null>(null);

/**
 * Read the navbar's open item. Only for triggers, which need to know whether
 * they are already open to decide whether a click opens them or follows them.
 */
export function useNavShell() {
  const context = useContext(Context);
  if (context === null) {
    throw new Error("useNavShell must be used inside <NavShell>");
  }
  return context;
}

/**
 * The navbar's one menu root, and the single viewport every top-tier panel
 * renders into.
 *
 * There is one viewport rather than a panel per trigger because the panels are
 * meant to read as one surface being re-aimed: hover Docs and it is under
 * Docs, hover the avatar and the same box travels to the avatar, resizing on
 * the way. Radix does the hoisting — a Content declared beside its Trigger is
 * rendered inside the Viewport, wherever that is — and hands us the active
 * panel's measurements as `--radix-navigation-menu-viewport-{width,height}`.
 *
 * What Radix does NOT do is place the viewport horizontally; the viewport it
 * gives you is a box you position yourself. That is the positioner below — an
 * absolutely placed wrapper pinned to the open trigger's offset within the bar,
 * measured before paint.
 *
 * Nothing in that placement may read the panel's width, which is the trap this
 * fell into once already. Radix measures the panel a commit AFTER the viewport
 * mounts, so on the opening frame `--radix-navigation-menu-viewport-width` does
 * not exist yet; a position computed from it is computed from the fallback, and
 * the panel visibly jumps when the real number lands. So a trigger that wants
 * its panel's far edge aligned to it says so — `data-nav-align="end"` — and the
 * positioner pulls itself back by `-translate-x-full`. That is a percentage of
 * the element's own box, which the browser resolves at paint from whatever
 * width the panel currently has: right on the first frame, still right after
 * the measurement, still right if the panel resizes later.
 *
 * The fold lives on the viewport inside, not here, because an animation's
 * `transform` would otherwise overwrite that translate for the length of the
 * animation and drag an end-aligned panel across to start-aligned mid-fold.
 *
 * The travel is deliberately conditional. Sliding is only honest between two
 * panels the viewer saw in one sequence — the box really did move from one to
 * the other. Opening from nothing has no previous position to come from, so a
 * transition there would animate the panel in from wherever it last happened
 * to be, which reads as a stray. `travelling` gates that, and the fold-in
 * carries the open instead.
 */
export default function NavShell({ children }: { children: ReactNode }) {
  const [value, setValue] = useState("");
  const [anchor, setAnchor] = useState({ x: 0, align: "start" });
  const [travelling, setTravelling] = useState(false);
  const rootRef = useRef<HTMLElement>(null);
  const previousValue = useRef("");

  // Layout, not passive: this runs before paint, so the viewport's very first
  // frame is already at the right trigger. In an effect the panel would paint
  // once at the old offset and then jump.
  useLayoutEffect(() => {
    const wasOpen = previousValue.current !== "";
    previousValue.current = value;

    const root = rootRef.current;
    if (root === null || value === "") {
      // Closed. The next open starts from nowhere again, so it must not
      // animate in from wherever this one happened to end up.
      setTravelling(false);
      return;
    }

    // The open trigger, rather than a ref per item: the triggers arrive inside
    // streamed server components, and threading a ref out through those costs
    // more than one query against a tree this small.
    const trigger = root.querySelector<HTMLElement>(
      '[data-nav-trigger][data-state="open"]',
    );
    if (trigger === null) return;

    // The trigger's own edge, not the panel's: `end` anchors the panel's right
    // edge to the trigger's right edge, and the positioner does the pulling
    // back with a percentage of itself. No width is read here on purpose.
    const align = trigger.dataset.navAlign === "end" ? "end" : "start";
    const rect = trigger.getBoundingClientRect();
    const rootLeft = root.getBoundingClientRect().left;

    setTravelling(wasOpen);
    setAnchor({
      align,
      x: (align === "end" ? rect.right : rect.left) - rootLeft,
    });
  }, [value]);

  return (
    <Context.Provider value={{ value, open: setValue }}>
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
            coordinate space it is applied in, and lets nothing through — an
            inert full-width strip under the header would otherwise eat the top
            of every page. */}
        <div className="pointer-events-none absolute inset-x-0 top-full">
          {/* `w-max` so the wrapper is exactly as wide as the panel, which is
              what makes `-translate-x-full` land the panel's right edge on the
              trigger. `max-w` keeps a wide panel on screen without anyone
              having to know how wide it is. */}
          <div
            data-align={anchor.align}
            data-travelling={travelling || undefined}
            style={{ left: `${anchor.x}px` }}
            className="absolute top-2 w-max max-w-[calc(100vw-1.5rem)] transition-none data-[align=end]:-translate-x-full data-[travelling]:transition-[left,translate] data-[travelling]:duration-200 data-[travelling]:ease-out"
          >
            <NavigationMenu.Viewport
              data-slot="nav-viewport"
              data-travelling={travelling || undefined}
              // Once the fold-in has finished the viewport is on screen, and
              // any later change of size is one the viewer can follow. Waiting
              // for the animation rather than a frame also waits out Radix
              // measuring the panel, which lands a commit or two after the
              // mount and would otherwise animate the box open from nothing.
              // Panels inside animate too and their events bubble, hence the
              // target check.
              onAnimationEnd={(event) => {
                if (event.target === event.currentTarget) setTravelling(true);
              }}
              className="data-[state=closed]:animate-nav-fold-out data-[state=open]:animate-nav-fold-in pointer-events-auto h-(--radix-navigation-menu-viewport-height) w-(--radix-navigation-menu-viewport-width) origin-top transition-none data-[travelling]:transition-[width,height] data-[travelling]:duration-200 data-[travelling]:ease-out"
            />
          </div>
        </div>
      </NavigationMenu.Root>
    </Context.Provider>
  );
}
