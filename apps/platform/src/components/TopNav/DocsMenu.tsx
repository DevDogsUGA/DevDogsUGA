"use client";

import { CaretDownIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { NavigationMenu } from "radix-ui";
import DocsProjectMark from "~/components/DocsProjectMark";
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
  label: string;
  active: boolean;
  /** Slug of the project being read right now, if any. */
  activeSlug: string | null;
  projects: DocsProjectLink[];
  className: string;
}

/**
 * The Docs navbar entry: a plain link to /docs, with a menu of the individual
 * projects that opens on hover.
 *
 * The hover intent, the focus handling and the Escape key all used to live
 * here, hand-written, because Radix's DropdownMenu trigger swallowed Enter and
 * would have taken /docs away from keyboard users. NavigationMenu is what was
 * wanted: its trigger is allowed to be a link, and it shares one viewport with
 * the profile menu, which lets the panel travel between the two rather than one
 * closing and another opening.
 */
export default function DocsMenu({
  label,
  active,
  activeSlug,
  projects,
  className,
}: Props) {
  const panelRef = useNavPanelRef();

  return (
    <NavigationMenu.Item value={DOCS_MENU} className="hidden md:block">
      <NavMenuTrigger active={active} className={`${className} gap-2`}>
        {label}
        <CaretDownIcon aria-hidden weight="bold" className="size-3.5" />
      </NavMenuTrigger>

      <NavigationMenu.Content
        ref={panelRef}
        data-slot="nav-content"
        className={NAV_CONTENT}
      >
        {/* The one element here with a size of its own, which is why the shell
            measures this rather than the panel around it. The panel is
            stretched to whatever the viewport currently is.

            One grid of every project, in the order their `order:`
            frontmatter gives them. Two columns from `lg`, not from `md`: the
            panel is anchored to its trigger, and at 768px a 36rem panel
            opening from a trigger that sits well into the bar would be pushed
            back off it by the viewport's clamp. Below `lg` it stays one 20rem
            column.

            A plain list of links rather than a role="menu" tree. The tab order
            already walks them in order, and calling them menuitems would
            promise arrow-key navigation the trigger deliberately does not
            implement. */}
        <ul
          data-nav-sizer
          className="grid w-80 gap-1 p-1 lg:w-[36rem] lg:grid-cols-2"
        >
          {projects.map((project) => (
            <li key={project.slug}>
              <NavigationMenu.Link asChild>
                <Link
                  href={`/docs/${encodeURIComponent(project.slug)}`}
                  aria-current={
                    project.slug === activeSlug ? "page" : undefined
                  }
                  className="flex h-full items-start gap-2.5 rounded-md px-2.5 py-2 transition-colors outline-none hover:bg-mauve-800 focus-visible:bg-mauve-800 aria-[current=page]:bg-mauve-800/60"
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
            </li>
          ))}
        </ul>
      </NavigationMenu.Content>
    </NavigationMenu.Item>
  );
}
