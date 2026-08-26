"use client";

import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { CaretLeftIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { Mark } from "~/components/DocsProjectMark";
import * as icons from "~/config/icons";
import type { NavGroup, NavItem } from "~/config/nav";
import { POPOVER_ROW, POPOVER_ROW_CARET } from "./popoverRow";

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
 *
 * The caret points and sits LEFT, which is where the panel lands. Radix hard-
 * codes `side` on a sub-menu to "right" in an ltr tree and strips the prop, so
 * this cannot be pinned — but the popover this hangs off is `align="end"` on
 * an avatar that `ml-auto` holds against the right edge of a full-width header,
 * so its own right edge is always within a couple of rems of the viewport's.
 * There is never room for a 20rem panel to that side and collision detection
 * flips every one of them. Re-anchoring the popover away from that edge is
 * what would falsify this, and would want the caret back on the right.
 */
export default function NavSubMenu({
  label,
  icon,
  iconBg,
  items,
  twoColumn,
}: NavGroup) {
  // An empty Console is the ordinary case for a member with no permissions.
  if (items.length === 0) return null;

  const GroupIcon = icons[icon];

  // Two containers rather than one grid with per-item placement, for the
  // reason the Docs menu splits its own: a single grid sizes each ROW to its
  // tallest cell, so a one-line description opposite a three-line one is
  // followed by a band of whitespace. Separate columns stack independently.
  //
  // Split down-then-across, so the column break falls between two rows that
  // were already adjacent and the reading order survives it.
  const columns = twoColumn
    ? [
        items.slice(0, Math.ceil(items.length / 2)),
        items.slice(Math.ceil(items.length / 2)),
      ]
    : [items];

  // A render function, not a component: declared here it would be a new type
  // on every render and remount the column it sits in.
  function renderItem(item: NavItem) {
    const Icon = icons[item.icon];
    return (
      <Dropdown.Item key={item.href} asChild>
        <Link
          href={item.href}
          className="flex items-start gap-2.5 rounded-md px-2.5 py-2 transition-colors outline-none hover:bg-mauve-800 focus-visible:bg-mauve-800 data-highlighted:bg-mauve-800"
        >
          <Mark icon={Icon} iconBg={iconBg} />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm font-medium text-white">{item.label}</span>
            {item.description && (
              <span className="text-xs/relaxed text-mauve-400">
                {item.description}
              </span>
            )}
          </span>
        </Link>
      </Dropdown.Item>
    );
  }

  return (
    <Dropdown.Sub>
      <Dropdown.SubTrigger
        className={`${POPOVER_ROW} cursor-default select-none data-highlighted:bg-mauve-800 data-[state=open]:bg-mauve-800`}
      >
        <CaretLeftIcon className={POPOVER_ROW_CARET} />
        <GroupIcon />
        {label}
      </Dropdown.SubTrigger>

      <Dropdown.Portal>
        {/* Two columns only from `lg`, and only where a group asked for them.
            The panel opens leftward out of a 16rem popover pinned to the right
            edge, so 36rem of it needs roughly 60rem of viewport to clear the
            left; below that it stays the single 20rem column it was.

            Clamped to the VIEWPORT, not to `--radix-…-available-width`. That
            variable measures the gap on the side the panel opens into, which
            on a phone is the ~5rem between the popover and the screen edge —
            honouring it there squeezes the panel to a column of broken words.
            Radix's own shift keeps it on screen instead, overlapping the
            popover the way a nested menu is supposed to when space runs out. */}
        <Dropdown.SubContent
          sideOffset={10}
          alignOffset={-6}
          collisionPadding={8}
          className={`animate-in fade-in-0 zoom-in-95 z-100 w-80 max-w-[calc(100vw-1rem)] origin-(--radix-dropdown-menu-content-transform-origin) rounded-lg border border-mauve-800 bg-mauve-950 p-1 shadow-lg duration-150 ease-out ${
            twoColumn
              ? "lg:grid lg:w-[36rem] lg:grid-cols-2 lg:items-start lg:gap-x-1"
              : ""
          }`}
        >
          {columns.map((column, index) => (
            // Below `lg` a two-column group is one column and these stack, so
            // the halves simply run on from each other in reading order.
            <div key={index}>{column.map(renderItem)}</div>
          ))}
        </Dropdown.SubContent>
      </Dropdown.Portal>
    </Dropdown.Sub>
  );
}
