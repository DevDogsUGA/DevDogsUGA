"use client";

import { NavigationMenu } from "radix-ui";
import type { ReactNode } from "react";

interface Props {
  /** Whether the viewer is on this trigger's own section right now. */
  active?: boolean;
  /**
   * Which of the panel's edges lines up with this trigger. "start" is the
   * default and the usual answer; a trigger sitting against the right of the
   * bar wants "end", so its panel opens back across the bar rather than off
   * the side of it. NavShell reads this off the DOM when it places the
   * viewport — see the note there about never measuring the panel.
   */
  align?: "start" | "end";
  className?: string;
  children: ReactNode;
}

/**
 * A top-tier trigger. It opens a menu, and that is all it does.
 *
 * It used to be a link as well — hover or first click opened the panel, a
 * second click followed the href — which meant intercepting every click,
 * cancelling Radix's own toggle, and pushing the route by hand. The control
 * then behaved like two different things depending on what it was already
 * doing, and looked like a link that sometimes refused to be one. A button
 * that opens a menu is the honest description of a control that opens a menu,
 * and Radix's own trigger handles it: hover opens, click toggles, and the
 * destinations live in the panel like every other destination does.
 *
 * While it is open the trigger grows an invisible skirt below itself, to the
 * bottom of the bar. Triggers are shorter than the bar they are centred in, so
 * a pointer heading straight down from one leaves it well before it reaches
 * the panel, and a close timer that runs out in that dead strip takes the menu
 * with it. The skirt covers the half of the gap inside the bar; the viewport's
 * lip covers the half below it. Only while open, so a strip of page under
 * every trigger is not permanently swallowing clicks.
 */
export default function NavMenuTrigger({
  active,
  align = "start",
  className,
  children,
}: Props) {
  return (
    <NavigationMenu.Trigger
      data-nav-trigger=""
      data-active={active === true ? "" : undefined}
      data-nav-align={align}
      // `cursor-pointer` because a button does not come with one and the links
      // either side of it do. The control changed; the way it answers the
      // pointer should not.
      className={`${className} relative cursor-pointer after:absolute after:inset-x-0 after:top-full after:hidden after:h-6 after:content-[''] data-[state=open]:after:block`}
    >
      {children}
    </NavigationMenu.Trigger>
  );
}
