import { rules, requireDashboard } from "~/server/auth/access";
import { notFound } from "next/navigation";

/**
 * The one gate on `/dashboard/docs-preview`.
 *
 * Signed-in members without `canPreviewDocs` get a 404. Unlike the
 * console (where a member without access sees a denied card), a card here
 * would confirm the route exists, and this route exists precisely so that
 * scheduled pages are invisible until they are live. The public docs cannot check who is asking, because the
 * platform's cache does not know, so the early-access copy is a separate route
 * that can.
 */
export async function requireDocsPreview(): Promise<string> {
  const caller = await requireDashboard();
  if (!rules.previewDocs(caller)) notFound();
  return caller.userId;
}
