import { redirect } from "next/navigation";
import { DASHBOARD_HOME } from "~/config/dashboard";
import { requireDashboard } from "~/server/auth/access";

/** Open Profile until B3 supplies the overview. */
export default async function DashboardPage() {
  await requireDashboard();
  redirect(DASHBOARD_HOME);
}
