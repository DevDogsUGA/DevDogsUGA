import { notFound } from "next/navigation";
import { fetchFile } from "@devdogsuga/docs-preview/client";
import DocPageContent from "~/components/DocPageContent";
import { PreviewRefreshClient } from "~/ui/preview-refresh-client";

interface Props {
  params: Promise<{ slug: string[] }>;
}

export default async function DocsPreviewSlugPage({ params }: Props) {
  const { slug } = await params;
  const isDocsPath = slug[0] === "docs";
  const localPath = isDocsPath
    ? `docs/${slug.slice(1).join("/")}.md`
    : `docs/${slug.join("/")}.md`;

  const source = await fetchFile(localPath).catch(() => null);

  if (!source) notFound();

  const breadcrumbs = [
    "Preview",
    ...slug.map((s) => s.charAt(0).toUpperCase() + s.slice(1)),
  ];

  return (
    <>
      <PreviewRefreshClient />
      <DocPageContent source={source} breadcrumbs={breadcrumbs} />
    </>
  );
}
