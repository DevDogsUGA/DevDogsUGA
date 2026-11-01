"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavigationMenu } from "radix-ui";
import type { DocsMenuEntry } from "~/config/docs";
import { CONTRIBUTE_HREF, PUBLIC_LINKS } from "~/config/nav";
import { docsSectionOf, docsSlugOf } from "~/lib/docsSection";
import "./topnav.css";
import DocsMenu from "./DocsMenu";
import { CONTRIBUTE_MENU, DOCS_MENU } from "./NavShell";

/** The two docs menus' rows, as the server resolved them. */
export interface DocsMenus {
  docs: DocsMenuEntry[];
  contribute: DocsMenuEntry[];
}

/**
 * The kit's `.topnav nav a` look (600 15, `--text-2`, a 4px bar on the current
 * link), for links that are items of the Radix list rather than anchors in a
 * `nav`. See topnav.css.
 */
const LINK_CLASS = "topnav-link";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

/**
 * The left-hand links, as items of the navbar's single list.
 *
 * They are items rather than their own <nav> so that Docs sits in the same
 * Radix collection as the profile menu on the far right. One collection means
 * one viewport, which lets a panel travel from one trigger to the other instead
 * of blinking out and back.
 */
function Nav({
  pathname,
  menus,
}: {
  pathname: string | null;
  menus: DocsMenus;
}) {
  const section = docsSectionOf(pathname, menus.contribute);
  return (
    <>
      {PUBLIC_LINKS.map((link) => {
        const menu =
          link.href === "/docs"
            ? ({ value: DOCS_MENU, entries: menus.docs, key: "docs" } as const)
            : link.href === CONTRIBUTE_HREF
              ? ({
                  value: CONTRIBUTE_MENU,
                  entries: menus.contribute,
                  key: "contribute",
                } as const)
              : null;
        const active =
          menu !== null
            ? section === menu.key
            : pathname !== null && isActive(pathname, link.href);

        if (menu !== null && menu.entries.length > 0) {
          return (
            <DocsMenu
              key={link.href}
              value={menu.value}
              label={link.label}
              active={active}
              activeSlug={docsSlugOf(pathname)}
              pathname={pathname}
              entries={menu.entries}
              className={LINK_CLASS}
            />
          );
        }

        // A menu with no rows is not worth opening. Docs stays a link to the
        // landing page; Contribute has nothing of its own to open, so it
        // leaves the bar until a project's docs exist.
        if (menu?.key === "contribute") return null;

        return (
          <NavigationMenu.Item
            key={link.href}
            value={link.href}
            className="flex self-stretch max-[900px]:hidden"
          >
            <NavigationMenu.Link asChild active={active}>
              <Link
                href={link.href}
                data-active={active || undefined}
                aria-current={active ? "page" : undefined}
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
 * Cache Components, so NavLinks must render inside a <Suspense> boundary. This
 * renders the same links without active-state highlighting until the client
 * resolves the pathname.
 */
export function NavLinksFallback({ menus }: { menus: DocsMenus }) {
  return <Nav pathname={null} menus={menus} />;
}

export default function NavLinks({ menus }: { menus: DocsMenus }) {
  const pathname = usePathname();
  return <Nav pathname={pathname} menus={menus} />;
}
