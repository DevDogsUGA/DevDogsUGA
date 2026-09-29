import { DocsProjectLayout } from "~/components/DocsRoute";

export default async function DocsLayout({
  children,
  params,
}: LayoutProps<"/docs/[project]">) {
  const { project } = await params;
  return (
    <DocsProjectLayout project={decodeURIComponent(project)} mode="public">
      {children}
    </DocsProjectLayout>
  );
}
