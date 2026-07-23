"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PUBLIC_LINKS } from "~/config/nav";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export default function NavLinks() {
  const pathname = usePathname();

  return (
    <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
      {PUBLIC_LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          data-active={isActive(pathname, link.href) || undefined}
          className="rounded-sm px-2.5 py-1.5 text-sm font-medium text-mauve-300 transition-colors hover:bg-mauve-800 hover:text-white data-active:bg-mauve-800/60 data-active:text-white"
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
