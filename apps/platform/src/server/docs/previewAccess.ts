import { notFound } from "next/navigation";
import { canUserPreviewDocs } from "~/server/actions/permissions";
import { expectSession } from "~/server/auth";

/**
 * The one gate on `/preview/docs`.
 *
 * Everyone without `canPreviewDocs` gets a 404, signed in or not. That is not
 * the convention for the console (`requireSession` sends a signed-out visitor
 * to sign-in): a redirect would confirm the route exists and that a login opens
 * it, and this route exists precisely so that scheduled pages are invisible
 * until they are live. The public docs cannot check who is asking, because the
 * platform's cache does not know, so the early-access copy is a separate route
 * that can.
 */
export async function requireDocsPreview(): Promise<string> {
  const userId = await expectSession().catch(() => null);
  if (userId === null || !(await canUserPreviewDocs(userId))) notFound();
  return userId;
}
