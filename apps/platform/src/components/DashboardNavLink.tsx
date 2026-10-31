"use client";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { SideNavLink } from "~/ui/side-nav";

/** Mark a section active after navigation without exposing server permissions. */
export default function DashboardNavLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  return (
    <SideNavLink
      href={href}
      icon={icon}
      active={pathname === href || pathname.startsWith(`${href}/`)}
    >
      {children}
    </SideNavLink>
  );
}
