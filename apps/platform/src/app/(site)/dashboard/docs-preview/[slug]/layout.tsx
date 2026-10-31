import { PreviewLayout } from "~/components/DocsPreviewRoute";

export default async function DocsPreviewProjectLayout({
  children,
  params,
}: LayoutProps<"/dashboard/docs-preview/[slug]">) {
  const { slug } = await params;
  return (
    <PreviewLayout slug={decodeURIComponent(slug)}>{children}</PreviewLayout>
  );
}
