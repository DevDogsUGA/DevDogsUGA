"use client";

import { CaretDownIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { NavigationMenu } from "radix-ui";
import DocsProjectMark from "~/components/DocsProjectMark";
import type { DocsMenuEntry } from "~/config/docs";
import NavMenuTrigger from "./NavMenuTrigger";
import { useNavPanelRef } from "./NavShell";
import { NAV_CONTENT } from "./navPanel";
import { POPOVER_ROW } from "./popoverRow";
import "./topnav.css";

interface Props {
  /** The item's value in the navbar's list: `DOCS_MENU` or `CONTRIBUTE_MENU`. */
  value: string;
  label: string;
  active: boolean;
  /** Slug of the docs project being read right now, if any. */
  activeSlug: string | null;
  /** The address being read, for a row that points into a project's folder. */
  pathname: string | null;
  entries: DocsMenuEntry[];
  className: string;
}

/** Whether the reader is inside what a row opens. */
function isCurrent(
  entry: DocsMenuEntry,
  activeSlug: string | null,
  pathname: string | null,
) {
  if (entry.project) return entry.project === activeSlug;
  return (
    pathname !== null &&
    [entry.href, ...(entry.covers ?? [])].some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
  );
}

/**
 * A navbar entry that is a menu of docs: **Docs** (platform-authored
 * documentation) and **Contribute** (the projects' own), which differ only in
 * their rows.
 *
 * The hover intent, the focus handling and the Escape key all used to live
 * here, hand-written, because Radix's DropdownMenu trigger swallowed Enter and
 * would have taken /docs away from keyboard users. NavigationMenu is what was
 * wanted: its trigger is allowed to be a link, and it shares one viewport with
 * the profile menu, which lets the panel travel between the menus rather than
 * one closing and another opening.
 */
export default function DocsMenu({
  value,
  label,
  active,
  activeSlug,
  pathname,
  entries,
  className,
}: Props) {
  const panelRef = useNavPanelRef();

  return (
    <NavigationMenu.Item
      value={value}
      className="flex self-stretch max-[900px]:hidden"
    >
      <NavMenuTrigger active={active} className={className}>
        {label}
        <CaretDownIcon aria-hidden weight="bold" className="size-3" />
      </NavMenuTrigger>

      <NavigationMenu.Content
        ref={panelRef}
        data-slot="nav-content"
        className={NAV_CONTENT}
      >
        {/* The one element here with a size of its own, which is why the shell
            measures this rather than the panel around it. The panel is
            stretched to whatever the viewport currently is.

            One grid of every row, in the order the menu gives them. Two
            columns from `lg`, not from `md`: the panel is anchored to its
            trigger, and at 768px a 36rem panel opening from a trigger that sits
            well into the bar would be pushed back off it by the viewport's
            clamp. Below `lg` it stays one 20rem column.

            A plain list of links rather than a role="menu" tree. The tab order
            already walks them in order, and calling them menuitems would
            promise arrow-key navigation the trigger deliberately does not
            implement. */}
        <ul
          data-nav-sizer
          className="grid w-80 gap-1 p-1 lg:w-[36rem] lg:grid-cols-2"
        >
          {entries.map((entry) => (
            <li key={entry.id}>
              <NavigationMenu.Link asChild>
                <Link
                  href={entry.href}
                  aria-current={
                    isCurrent(entry, activeSlug, pathname) ? "page" : undefined
                  }
                  className={`${POPOVER_ROW} h-full items-start`}
                >
                  <DocsProjectMark mark={entry.mark} />
                  <span className="tn-row-copy">
                    <span>{entry.name}</span>
                    {entry.description && <span>{entry.description}</span>}
                  </span>
                </Link>
              </NavigationMenu.Link>
            </li>
          ))}
        </ul>
      </NavigationMenu.Content>
    </NavigationMenu.Item>
  );
}
