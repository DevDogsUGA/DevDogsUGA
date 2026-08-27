"use client";

import { CaretLeftIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { NavigationMenu } from "radix-ui";
import { Mark } from "~/components/DocsProjectMark";
import * as icons from "~/config/icons";
import type { NavGroup, NavItem } from "~/config/nav";
import { NAV_SUB_CONTENT } from "./navPanel";
import { POPOVER_ROW, POPOVER_ROW_CARET } from "./popoverRow";

/**
 * One group of profile-menu links, folded into a sub-menu.
 *
 * The panel is the navbar's Docs menu wearing a different set of links: the
 * same mauve card, the same marked two-line rows, so a menu that opens
 * sideways out of the avatar still looks like the one that opens down out of
 * Docs. Its content is hoisted into the sub-viewport its sibling declares, so
 * Competitions and Console are one box that resizes between them rather than
 * two that swap.
 *
 * The caret points and sits LEFT, which is where the panel lands — the
 * sub-viewport is pinned off the card's left edge, so it can only go that way.
 * That used to be a claim about collision detection; now it is the layout,
 * which is a better guarantee than a measurement.
 */
export default function NavSubMenu({
  label,
  iconBg,
  items,
  twoColumn,
  panelRef,
}: NavGroup & {
  /** Tells the popover this panel has been hoisted, so it can measure it. */
  panelRef: (node: HTMLElement | null) => void;
}) {
  // An empty Console is the ordinary case for a member with no permissions.
  if (items.length === 0) return null;

  // Two containers rather than one grid with per-item placement, for the
  // reason the Docs menu splits its own: a single grid sizes each ROW to its
  // tallest cell, so a one-line description opposite a three-line one is
  // followed by a band of whitespace. Separate columns stack independently.
  //
  // Split down-then-across, so the column break falls between two rows that
  // were already adjacent and the reading order survives it.
  const half = Math.ceil(items.length / 2);
  const columns = twoColumn
    ? [items.slice(0, half), items.slice(half)]
    : [items];

  // A render function, not a component: declared here it would be a new type
  // on every render and remount the column it sits in.
  function renderItem(item: NavItem) {
    const Icon = icons[item.icon];
    return (
      <NavigationMenu.Link key={item.href} asChild>
        <Link
          href={item.href}
          className="flex items-start gap-2.5 rounded-md px-2.5 py-2 transition-colors outline-none hover:bg-mauve-800 focus-visible:bg-mauve-800"
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
      </NavigationMenu.Link>
    );
  }

  return (
    <NavigationMenu.Item value={label}>
      <NavigationMenu.Trigger
        data-nav-sub-trigger=""
        className={`${POPOVER_ROW} cursor-default select-none data-[state=open]:bg-mauve-800`}
      >
        <CaretLeftIcon className={POPOVER_ROW_CARET} />
        {label}
      </NavigationMenu.Trigger>

      <NavigationMenu.Content
        ref={panelRef}
        data-slot="nav-content"
        className={NAV_SUB_CONTENT}
      >
        {/* Two columns only from `lg`, and only where a group asked for them.
            The whole row — sub-panel plus card — has to clear the left of the
            bar, so 36rem of sub-panel wants roughly 60rem of viewport; below
            that it stays the single 20rem column it was. */}
        <div
          className={`w-80 rounded-lg border border-mauve-800 bg-mauve-950 p-1 shadow-lg ${
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
        </div>
      </NavigationMenu.Content>
    </NavigationMenu.Item>
  );
}
