import { notFound } from "next/navigation";
import { fetchFile } from "@devdogsuga/docs-preview/client";
import DocPageContent from "~/components/DocPageContent";
import { PreviewRefreshClient } from "~/ui/preview-refresh-client";

export default async function DocsPreviewIndexPage() {
  const source =
    (await fetchFile("docs/index.md").catch(() => null)) ??
    (await fetchFile("docs/index.mdx").catch(() => null));

  if (!source) notFound();

  return (
    <>
      <PreviewRefreshClient />
      <DocPageContent source={source} breadcrumbs={["Preview"]} />
    </>
  );
}
