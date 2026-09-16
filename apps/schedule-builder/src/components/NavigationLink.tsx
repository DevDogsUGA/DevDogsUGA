"use client";

import type { PropsWithChildren } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface Props extends PropsWithChildren {
  href: string;
}

export default function NavigationLink({ href, children }: Props) {
  const pathname = usePathname();

  return (
    <li>
      <Link
        href={href}
        className="text-muted hover:bg-surface-muted hover:text-foreground data-active:bg-primary-soft data-active:text-accent flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
        data-active={pathname.startsWith(href) || undefined}
      >
        {children}
      </Link>
    </li>
  );
}
