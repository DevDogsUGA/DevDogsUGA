"use client";

import { CaretDownIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { NavigationMenu } from "radix-ui";
import { useMemo } from "react";
import DocsProjectMark from "~/components/DocsProjectMark";
import { groupDocsProjects } from "~/config/docs";
import NavMenuTrigger from "./NavMenuTrigger";
import { DOCS_MENU, useNavPanelRef } from "./NavShell";
import { NAV_CONTENT } from "./navPanel";

/** One docs project, as listed in the navbar menu. */
export interface DocsProjectLink {
  slug: string;
  name: string;
  description: string | null;
}

interface Props {
  href: string;
  label: string;
  active: boolean;
  /** Slug of the project being read right now, if any. */
  activeSlug: string | null;
  projects: DocsProjectLink[];
  className: string;
}

/**
 * The Docs navbar entry: still a plain link to /docs, with a menu of the
 * individual projects that opens on hover.
 *
 * The hover intent, the focus handling and the Escape key all used to live
 * here, hand-written, because Radix's DropdownMenu trigger swallowed Enter and
 * would have taken /docs away from keyboard users. NavigationMenu is the
 * primitive that was actually wanted: its trigger is allowed to be a link, and
 * it shares one viewport with the profile menu, which is what lets the panel
 * travel between the two rather than one closing and another opening.
 */
export default function DocsMenu({
  href,
  label,
  active,
  activeSlug,
  projects,
  className,
}: Props) {
  const panelRef = useNavPanelRef();
  const groups = useMemo(() => groupDocsProjects(projects), [projects]);

  // Two containers rather than one grid with per-item column placement: a
  // single grid sizes each ROW to its tallest cell, so the short left-hand
  // groups would each be followed by a band of whitespace as tall as Apps.
  // Separate columns let each side stack at its own height.
  const leftGroups = groups.filter((group) => group.column === "left");
  const rightGroups = groups.filter((group) => group.column === "right");

  // A render function, not a component: called inline it produces the same
  // element tree React would diff anyway, where a component declared here
  // would be a new type on every render and remount the whole column.
  //
  // A plain group + label rather than a role="menu" tree — these are links the
  // tab order already walks in order, and calling them menuitems would promise
  // arrow-key navigation the trigger deliberately does not implement.
  function renderGroup(group: (typeof groups)[number]) {
    return (
      <div key={group.id} role="group" aria-label={group.label}>
        <p className="px-2.5 pt-2 pb-1 text-xs font-semibold tracking-wide text-mauve-500 uppercase">
          {group.label}
        </p>
        {group.projects.map((project) => (
          <NavigationMenu.Link key={project.slug} asChild>
            <Link
              href={`/docs/${encodeURIComponent(project.slug)}`}
              aria-current={project.slug === activeSlug ? "page" : undefined}
              className="flex items-start gap-2.5 rounded-md px-2.5 py-2 transition-colors outline-none hover:bg-mauve-800 focus-visible:bg-mauve-800 aria-[current=page]:bg-mauve-800/60"
            >
              <DocsProjectMark slug={project.slug} />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-medium text-white">
                  {project.name}
                </span>
                {project.description && (
                  <span className="text-xs/relaxed text-mauve-400">
                    {project.description}
                  </span>
                )}
              </span>
            </Link>
          </NavigationMenu.Link>
        ))}
      </div>
    );
  }

  return (
    <NavigationMenu.Item value={DOCS_MENU} className="hidden md:block">
      <NavMenuTrigger
        href={href}
        value={DOCS_MENU}
        active={active}
        className={`${className} gap-2`}
      >
        {label}
        <CaretDownIcon aria-hidden className="size-3.5" />
      </NavMenuTrigger>

      <NavigationMenu.Content
        ref={panelRef}
        data-slot="nav-content"
        className={NAV_CONTENT}
      >
        {/* The one element here with a size of its own, which is why the shell
            measures this rather than the panel around it — the panel is
            stretched to whatever the viewport currently is.

            Two columns from `lg`, not from `md`. The panel is anchored to its
            trigger, and at 768px a 36rem panel opening from a trigger that
            sits well into the bar would be pushed back off it by the
            viewport's clamp. Below `lg` it stays one 20rem column. */}
        <div
          data-nav-sizer
          className="w-80 p-1 lg:grid lg:w-[36rem] lg:grid-cols-2 lg:items-start lg:gap-x-1"
        >
          {/* Below `lg` this is one column and the two halves stack, so the
              left-hand groups come first and Apps follows. Reading order
              stays sensible; only the side-by-side arrangement is lost. */}
          <div>{leftGroups.map(renderGroup)}</div>
          <div>{rightGroups.map(renderGroup)}</div>
        </div>
      </NavigationMenu.Content>
    </NavigationMenu.Item>
  );
}
