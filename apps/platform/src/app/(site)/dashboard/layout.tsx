import type { Metadata } from "next";
import { requireDashboard } from "~/server/auth/access";

/** Every dashboard page is private, including pages added later. */
export const metadata: Metadata = { robots: { index: false } };

/**
 * The one session gate for the signed-in area.
 *
 * The baseline had no shell around these pages: `/attendance` and `/account`
 * were plain pages in the site layout, and `/console/*` added only a
 * `bg-mauve-900` column (`flex min-w-0 flex-1 flex-col`) around its pages, which
 * the console pages restored in R5 apply themselves.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireDashboard();
  return <>{children}</>;
}
