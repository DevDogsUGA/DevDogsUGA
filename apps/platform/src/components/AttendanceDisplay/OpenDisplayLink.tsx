"use client";

import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";

/**
 * Sized for a laptop driving a projector: big enough to read the QR at a
 * glance while dragging the window to the second display, small enough to
 * still show the console tab underneath while an officer lines it up. The
 * fullscreen control on the display itself is what makes it fill the
 * projector once it's there.
 */
const DISPLAY_WINDOW_FEATURES = "popup,width=1280,height=800";

/**
 * Opens an attendance display in its own browser window instead of
 * navigating the console tab away from the meeting list.
 *
 * A plain `<a>` under the hood (not a button), so middle-click / "open in
 * new tab" / "copy link" still work exactly as they would for any other
 * link -- `onClick` only intercepts the ordinary left click, which is the
 * one case that would otherwise replace the console tab.
 */
export default function OpenDisplayLink({
  href,
  children,
  className,
  ...rest
}: {
  href: string;
  children: ReactNode;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "onClick">) {
  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    window.open(href, `devdogs-attendance-${href}`, DISPLAY_WINDOW_FEATURES);
  }

  return (
    <a href={href} onClick={onClick} className={className} {...rest}>
      {children}
    </a>
  );
}
