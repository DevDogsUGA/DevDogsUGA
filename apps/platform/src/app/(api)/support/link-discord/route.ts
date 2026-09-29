import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { authenticate, expectSession } from "~/server/auth";
import { requestAuthorization } from "~/server/auth/providers/google";

/**
 * GET /support/link-discord?next=/docs/...
 *
 * The widget's "Get notified when someone responds" button. For a member it
 * is the ordinary Discord link flow; for a guest it chains the two steps the
 * platform requires -- sign in with UGA Google, land back here, then link
 * Discord -- so the guest sees one button, not two. The guest's conversations
 * move onto the account on the widget's next request (see `currentVisitor`).
 */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("next") ?? "/docs";
  // Same-origin paths only; never an open redirect.
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/docs";

  const userId = await expectSession().catch(() => null);
  if (!userId) {
    await requestAuthorization(
      `/support/link-discord?next=${encodeURIComponent(next)}`,
    );
  }
  await authenticate("discord", next);
  redirect(next);
}
