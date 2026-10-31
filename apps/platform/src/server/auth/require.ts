import { requireDashboard } from "~/server/auth/access";

/** The caller’s id, or sign-in with the original dashboard URL. */
export async function requireSession(): Promise<string> {
  return (await requireDashboard()).userId;
}
