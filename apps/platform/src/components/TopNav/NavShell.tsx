"use client";

import { NavigationMenu } from "radix-ui";
import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
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
 * gives you is a box you position yourself. That is the `--nav-x` below: the
 * open trigger's offset within the bar, measured before paint, clamped in CSS
 * so a panel wider than the space left of the viewport's right edge slides
 * back inside instead of running off. The clamp is what right-aligns the
 * profile panel under an avatar that sits against the right edge, without the
 * two triggers needing to declare different alignments.
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
  const [x, setX] = useState(0);
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

    setTravelling(wasOpen);
    setX(
      trigger.getBoundingClientRect().left - root.getBoundingClientRect().left,
    );
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
        <NavigationMenu.List className="flex h-16 items-center gap-4 px-4 md:px-6">
          {children}
        </NavigationMenu.List>

        {/* Spans the bar so `--nav-x` and the clamp share one coordinate
            space, and lets nothing through — an inert full-width strip under
            the header would otherwise eat the top of every page. */}
        <div
          className="pointer-events-none absolute inset-x-0 top-full"
          style={{ "--nav-x": `${x}px` } as CSSProperties}
        >
          <NavigationMenu.Viewport
            data-slot="nav-viewport"
            data-travelling={travelling || undefined}
            // Once the fold-in has finished, the viewport is on screen and
            // every later move is a move the viewer can follow — including a
            // profile sub-menu widening it, which changes the box without
            // changing `value`. Waiting for the animation rather than a frame
            // also waits out Radix measuring the panel, which arrives a
            // commit or two after the mount and would otherwise animate the
            // box open from zero. Child panels animate too and their events
            // bubble, hence the target check.
            onAnimationEnd={(event) => {
              if (event.target === event.currentTarget) setTravelling(true);
            }}
            style={{
              left: "clamp(0.75rem, var(--nav-x), calc(100% - var(--radix-navigation-menu-viewport-width, 20rem) - 0.75rem))",
            }}
            className="data-[state=closed]:animate-nav-fold-out data-[state=open]:animate-nav-fold-in pointer-events-auto absolute top-2 h-(--radix-navigation-menu-viewport-height) w-(--radix-navigation-menu-viewport-width) origin-top transition-none data-[travelling]:transition-[left,width,height] data-[travelling]:duration-200 data-[travelling]:ease-out"
          />
        </div>
      </NavigationMenu.Root>
    </Context.Provider>
  );
}
