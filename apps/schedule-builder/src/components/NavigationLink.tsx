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
    <li className="contents">
      <Link
        href={href}
        className="flex flex-col items-center gap-0.75 border-0 border-red-950 px-3 py-2 transition-colors hover:bg-red-200 data-active:-mb-px data-active:border-b-2 data-active:pb-1.75 data-active:not-hover:bg-red-50"
        data-active={pathname.startsWith(href) || undefined}
      >
        {children}
      </Link>
    </li>
  );
}
