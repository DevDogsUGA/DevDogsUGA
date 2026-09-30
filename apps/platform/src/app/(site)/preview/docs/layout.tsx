import type { Metadata } from "next";
import { requireDocsPreview } from "~/server/docs/previewAccess";

export const metadata: Metadata = {
  title: "Docs preview | DevDogs",
  robots: { index: false, follow: false },
};

/**
 * Never cached, and gated once for everything under it: anyone without
 * `canPreviewDocs` gets a 404. The gate reads the session, which is what makes
 * every route below dynamic; `force-dynamic` says so out loud, so a later edit
 * cannot make one of them cacheable by accident. Each page here also sits in
 * the shared cache's blind spot: whatever is cached for one visitor is served
 * to the next, which is exactly what early access cannot be.
 */
export const dynamic = "force-dynamic";

export default async function PreviewDocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireDocsPreview();
  return <>{children}</>;
}
