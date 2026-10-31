import { rules, loadCaller } from "~/server/auth/access";
import { notFound } from "next/navigation";

/**
 * The one gate on `/preview/docs`.
 *
 * Everyone without `canPreviewDocs` gets a 404, signed in or not. Unlike the
 * console (where a member without access sees a denied card), a card here
 * would confirm the route exists, and this route exists precisely so that
 * scheduled pages are invisible until they are live. The public docs cannot check who is asking, because the
 * platform's cache does not know, so the early-access copy is a separate route
 * that can.
 */
export async function requireDocsPreview(): Promise<string> {
  const caller = await loadCaller();
  if (!caller || !rules.previewDocs(caller)) notFound();
  return caller.userId;
}
