"use client";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { SideNavLink } from "~/ui/side-nav";

/**
 * Mark a section active after navigation without exposing server permissions.
 * `exact` is for the Overview, which every other dashboard path sits beneath.
 */
export default function DashboardNavLink({
  href,
  icon,
  exact,
  children,
}: {
  href: string;
  icon: ReactNode;
  exact?: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  return (
    <SideNavLink
      href={href}
      icon={icon}
      active={pathname === href || (!exact && pathname.startsWith(`${href}/`))}
    >
      {children}
    </SideNavLink>
  );
}
