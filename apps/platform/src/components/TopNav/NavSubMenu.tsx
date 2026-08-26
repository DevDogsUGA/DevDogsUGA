"use client";

import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { CaretRightIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { Mark } from "~/components/DocsProjectMark";
import * as icons from "~/config/icons";
import type { NavGroup } from "~/config/nav";

/**
 * One group of profile-menu links, folded into a sub-menu.
 *
 * The panel is the navbar's Docs menu wearing a different set of links: the
 * same mauve card, the same marked two-line rows, so a menu that opens
 * sideways out of the avatar still looks like the one that opens down out of
 * Docs. Radix's Sub is what the Docs menu could not use — its trigger is a
 * link to /docs and Radix would swallow Enter — but a group heading has no
 * destination of its own, so here the primitive is free to open on hover, on
 * ArrowRight, and on Enter, and to close on Escape, all of it for nothing.
 */
export default function NavSubMenu({ label, icon, iconBg, items }: NavGroup) {
  // An empty Console is the ordinary case for a member with no permissions.
  if (items.length === 0) return null;

  const GroupIcon = icons[icon];

  return (
    <Dropdown.Sub>
      <Dropdown.SubTrigger className="flex w-full cursor-default items-center justify-between gap-2 px-3 py-1.5 text-left transition-colors outline-none select-none hover:bg-mauve-800 data-highlighted:bg-mauve-800 data-[state=open]:bg-mauve-800">
        {label}
        <span className="flex items-center gap-1">
          <GroupIcon />
          <CaretRightIcon className="size-3 text-mauve-400" />
        </span>
      </Dropdown.SubTrigger>

      <Dropdown.Portal>
        <Dropdown.SubContent
          sideOffset={10}
          alignOffset={-6}
          collisionPadding={8}
          className="animate-in fade-in-0 zoom-in-95 z-100 w-80 max-w-(--radix-dropdown-menu-content-available-width) origin-(--radix-dropdown-menu-content-transform-origin) rounded-lg border border-mauve-800 bg-mauve-950 p-1 shadow-lg duration-150 ease-out"
        >
          {items.map((item) => {
            const Icon = icons[item.icon];
            return (
              <Dropdown.Item key={item.href} asChild>
                <Link
                  href={item.href}
                  className="flex items-start gap-2.5 rounded-md px-2.5 py-2 transition-colors outline-none hover:bg-mauve-800 focus-visible:bg-mauve-800 data-highlighted:bg-mauve-800"
                >
                  <Mark icon={Icon} iconBg={iconBg} />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm font-medium text-white">
                      {item.label}
                    </span>
                    {item.description && (
                      <span className="text-xs/relaxed text-mauve-400">
                        {item.description}
                      </span>
                    )}
                  </span>
                </Link>
              </Dropdown.Item>
            );
          })}
        </Dropdown.SubContent>
      </Dropdown.Portal>
    </Dropdown.Sub>
  );
}
