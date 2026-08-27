"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavigationMenu } from "radix-ui";
import { PUBLIC_LINKS } from "~/config/nav";
import DocsMenu, { type DocsProjectLink } from "./DocsMenu";

/**
 * `inline-flex` is what makes Docs line up with the rest. A plain inline
 * anchor's padding does not grow its line box, so these sat 30px tall inside
 * 24px items, while Docs — a flex row, because it carries a caret — sat 32px
 * tall inside 32px. Two pixels of height and one of offset, on the hover fill,
 * on the one link in the row that opens something. Giving every link the same
 * box makes them the same box.
 */
const LINK_CLASS =
  "inline-flex items-center rounded-sm px-2.5 py-1.5 text-sm font-medium text-mauve-300 transition-colors hover:bg-mauve-800 hover:text-white data-active:bg-mauve-800/60 data-active:text-white";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

/** The project being read, from a /docs/[project] pathname. */
function activeDocsSlug(pathname: string | null) {
  if (pathname === null) return null;
  const [, first, second] = pathname.split("/");
  return first === "docs" && second ? decodeURIComponent(second) : null;
}

/**
 * The left-hand links, as items of the navbar's single list.
 *
 * They are items rather than their own <nav> so that Docs sits in the same
 * Radix collection as the profile menu on the far right: one collection is one
 * viewport, and one viewport is what lets a panel travel from one to the other
 * instead of blinking out and back.
 */
function Nav({
  pathname,
  docsProjects,
}: {
  pathname: string | null;
  docsProjects: DocsProjectLink[];
}) {
  return (
    <>
      {PUBLIC_LINKS.map((link) => {
        const active = pathname !== null && isActive(pathname, link.href);

        if (link.href === "/docs" && docsProjects.length > 0) {
          return (
            <DocsMenu
              key={link.href}
              href={link.href}
              label={link.label}
              active={active}
              activeSlug={activeDocsSlug(pathname)}
              projects={docsProjects}
              className={LINK_CLASS}
            />
          );
        }

        return (
          <NavigationMenu.Item
            key={link.href}
            value={link.href}
            className="hidden md:block"
          >
            <NavigationMenu.Link asChild active={active}>
              <Link
                href={link.href}
                data-active={active || undefined}
                className={LINK_CLASS}
              >
                {link.label}
              </Link>
            </NavigationMenu.Link>
          </NavigationMenu.Item>
        );
      })}
    </>
  );
}

/**
 * Static fallback for the prerendered shell. usePathname() is dynamic under
 * Cache Components, so NavLinks must render inside a <Suspense> boundary; this
 * renders the same links without active-state highlighting until the client
 * resolves the pathname.
 */
export function NavLinksFallback({
  docsProjects,
}: {
  docsProjects: DocsProjectLink[];
}) {
  return <Nav pathname={null} docsProjects={docsProjects} />;
}

export default function NavLinks({
  docsProjects,
}: {
  docsProjects: DocsProjectLink[];
}) {
  const pathname = usePathname();
  return <Nav pathname={pathname} docsProjects={docsProjects} />;
}
