import { notFound } from "next/navigation";
import { requireDashboard } from "~/server/auth/access";

/** Unknown paths disclose nothing before sign-in, then render the 404. */
export default async function UnknownDashboardPage() {
  await requireDashboard();
  notFound();
}
