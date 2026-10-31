import type { Metadata } from "next";
import AppSideNav from "~/components/AppSideNav";
import { requireDashboard } from "~/server/auth/access";
import { AppShell } from "~/ui/app-shell";

/** Every dashboard page is private, including pages added later. */
export const metadata: Metadata = { robots: { index: false } };

/** One session gate and shell for the signed-in area. */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireDashboard();
  return <AppShell side={<AppSideNav />}>{children}</AppShell>;
}
