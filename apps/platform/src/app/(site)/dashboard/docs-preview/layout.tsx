import type { Metadata } from "next";
import { requireDashboard } from "~/server/auth/access";

export const metadata: Metadata = {
  title: "Docs preview | DevDogs",
  robots: { index: false, follow: false },
};

/**
 * Never cached, and signed-in only for everything under it. Who may read which
 * project is decided per project (`server/docs/previewAccess.ts`): an owner or
 * a contributor sees their own project's docs here, a docs reviewer sees any,
 * and everyone else gets a 404. The gate reads the session, which is what makes
 * every route below dynamic; `force-dynamic` says so out loud, so a later edit
 * cannot make one of them cacheable by accident. Whatever is cached for one
 * visitor is served to the next, which is exactly what early access cannot be.
 */
export const dynamic = "force-dynamic";

export default async function DocsPreviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireDashboard();
  return <>{children}</>;
}
