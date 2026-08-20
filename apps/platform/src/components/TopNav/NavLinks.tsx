"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PUBLIC_LINKS } from "~/config/nav";
import DocsMenu, { type DocsProjectLink } from "./DocsMenu";

const LINK_CLASS =
  "rounded-sm px-2.5 py-1.5 text-sm font-medium text-mauve-300 transition-colors hover:bg-mauve-800 hover:text-white data-active:bg-mauve-800/60 data-active:text-white";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

/** The project being read, from a /docs/[project] pathname. */
function activeDocsSlug(pathname: string | null) {
  if (pathname === null) return null;
  const [, first, second] = pathname.split("/");
  return first === "docs" && second ? decodeURIComponent(second) : null;
}

function Nav({
  pathname,
  docsProjects,
}: {
  pathname: string | null;
  docsProjects: DocsProjectLink[];
}) {
  return (
    <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
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
          <Link
            key={link.href}
            href={link.href}
            data-active={active || undefined}
            className={LINK_CLASS}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
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
