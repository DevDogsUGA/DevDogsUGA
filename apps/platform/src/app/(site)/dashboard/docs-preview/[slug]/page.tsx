import { PreviewIndex } from "~/components/DocsPreviewRoute";

export default async function DocsPreviewProjectPage({
  params,
}: PageProps<"/dashboard/docs-preview/[slug]">) {
  const { slug } = await params;
  return <PreviewIndex slug={decodeURIComponent(slug)} />;
}
