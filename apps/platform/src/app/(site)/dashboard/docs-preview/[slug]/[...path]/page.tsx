import type { Metadata } from "next";
import { PreviewPage, previewMetadata } from "~/components/DocsPreviewRoute";

export async function generateMetadata({
  params,
}: PageProps<"/dashboard/docs-preview/[slug]/[...path]">): Promise<Metadata> {
  const { slug, path } = await params;
  return previewMetadata(
    decodeURIComponent(slug),
    path.map(decodeURIComponent),
  );
}

export default async function DocsPreviewPage({
  params,
}: PageProps<"/dashboard/docs-preview/[slug]/[...path]">) {
  const { slug, path } = await params;
  return (
    <PreviewPage
      slug={decodeURIComponent(slug)}
      path={path.map(decodeURIComponent)}
    />
  );
}
