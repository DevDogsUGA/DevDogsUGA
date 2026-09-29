import { DocsProjectLayout } from "~/components/DocsRoute";

export default async function DocsPreviewProjectLayout({
  children,
  params,
}: LayoutProps<"/preview/docs/[project]">) {
  const { project } = await params;
  return (
    <DocsProjectLayout project={decodeURIComponent(project)} mode="preview">
      {children}
    </DocsProjectLayout>
  );
}
