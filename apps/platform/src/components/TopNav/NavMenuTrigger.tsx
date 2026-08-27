"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { NavigationMenu } from "radix-ui";
import type { ReactNode } from "react";
import { useNavShell } from "./NavShell";

interface Props {
  /** Where a second click goes. */
  href: string;
  /** This item's value in the shell — see DOCS_MENU / PROFILE_MENU. */
  value: string;
  /** Whether the viewer is on this trigger's own section right now. */
  active?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * A top-tier trigger that is also a real link.
 *
 * Hover opens it. The first click opens it too, which is the whole reason the
 * click is intercepted: on a touch screen there is no hover, and a trigger
 * that navigated on first tap would make the menu unreachable there. A second
 * click, with the panel already open, follows the link — so the destination is
 * never more than a tap out of the way, and pointer users who know where they
 * are going can still get there.
 *
 * Every branch calls `preventDefault`, which is load-bearing twice over. It
 * stops the anchor from navigating on the opening click, and it stops Radix's
 * own click handler, which toggles the item shut — the very thing the second
 * click must not do. Navigation is then pushed by hand. Modified clicks return
 * before any of that, so cmd-click and middle-click still open a tab, which is
 * the reason this is an anchor and not a button.
 */
export default function NavMenuTrigger({
  href,
  value,
  active,
  className,
  children,
}: Props) {
  const router = useRouter();
  const shell = useNavShell();
  const open = shell.value === value;

  return (
    <NavigationMenu.Trigger asChild data-nav-trigger="">
      <Link
        href={href}
        data-active={active === true ? "" : undefined}
        className={className}
        onClick={(event) => {
          const modified =
            event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
          if (modified || event.button !== 0) return;

          event.preventDefault();
          if (open) router.push(href);
          else shell.open(value);
        }}
      >
        {children}
      </Link>
    </NavigationMenu.Trigger>
  );
}
