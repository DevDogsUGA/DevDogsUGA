import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import DocPageContent from "~/components/DocPageContent";
import DocsFolderContents from "~/components/DocsFolderContents";
import { DOCS_BRANCH, DOCS_REPO } from "~/config/docs";
import { env } from "~/env";
import { docsHref, projectPath } from "~/lib/docsSlug";
import { toTitleCase } from "~/lib/toTitleCase";
import { allFolders, indexPageOf, type DocsTreeNode } from "~/lib/docsTree";
import {
  getDocsFolder,
  getDocsFolderEntries,
  getDocsPage,
  getDocsProjects,
  getDocsTree,
} from "~/server/docs/queries";

// Every docs page AND every folder is enumerated below and prerendered at
// build time. Anything else renders on demand and 404s via notFound(), which
// is safe on Workers because the lookup reads a bundled constant, not the
// filesystem.
// (`dynamicParams` can't express that here: Cache Components rejects the route
// segment config.)
export function generateStaticParams() {
  const params: { project: string; slug: string[] }[] = [];

  function collect(project: string, nodes: DocsTreeNode[]) {
    for (const node of nodes) {
      if (node.type === "page") {
        params.push({ project, slug: node.path.split("/") });
      } else {
        collect(project, node.children);
      }
    }
  }

  for (const project of getDocsProjects()) {
    const tree = getDocsTree(project.slug);
    collect(project.slug, tree);
    // A folder is a destination of its own: the sidebar's section headings
    // link to one, and it answers with its index page or with its contents.
    for (const folder of allFolders(tree)) {
      params.push({ project: project.slug, slug: folder.path.split("/") });
    }
  }

  return params;
}

export async function generateMetadata({
  params,
}: PageProps<"/docs/[project]/[...slug]">): Promise<Metadata> {
  const { project, slug } = await params;
  const projectSlug = decodeURIComponent(project);
  const path = slug.map(decodeURIComponent).join("/");

  // The link card. Docs pages live under a catch-all, and Next refuses an
  // `opengraph-image.tsx` inside one ("Catch-all must be the last part of the
  // URL"), so this is the one public route whose card comes from a route
  // handler instead of the file convention. It takes the project and path
  // rather than a title, and looks them up itself — see the handler.
  const card = {
    images: [
      {
        url: `/og/docs?project=${encodeURIComponent(projectSlug)}&path=${encodeURIComponent(path)}`,
        width: 1200,
        height: 630,
      },
    ],
  };

  const page = getDocsPage(projectSlug, path);
  if (page) {
    return {
      title: `${page.title} | DevDogs Docs`,
      description: page.description ?? undefined,
      openGraph: card,
    };
  }

  const folder = getDocsFolder(projectSlug, path);
  if (folder) {
    return { title: `${folder.name} | DevDogs Docs`, openGraph: card };
  }

  return {};
}

export default async function DocsPage({
  params,
}: PageProps<"/docs/[project]/[...slug]">) {
  const { project, slug } = await params;
  const projectSlug = decodeURIComponent(project);
  const path = slug.map(decodeURIComponent);

  const page = getDocsPage(projectSlug, path.join("/"));
  const breadcrumbs = [
    toTitleCase(projectSlug),
    ...path.slice(0, -1).map(toTitleCase),
  ];

  if (!page) {
    // Not a page, but the sidebar links folders too, so it may be one.
    const folder = getDocsFolder(projectSlug, path.join("/"));
    if (!folder) notFound();

    // A folder with an index page has something better to show than a list of
    // itself, and that page is what the section means.
    const index = indexPageOf(folder);
    if (index) redirect(docsHref(projectSlug, index.path.split("/")));

    return (
      <DocsFolderContents
        project={projectSlug}
        title={folder.name}
        breadcrumbs={breadcrumbs}
        entries={getDocsFolderEntries(projectSlug, folder)}
      />
    );
  }

  const githubUrl = `https://github.com/${env.GITHUB_ORG}/${DOCS_REPO}/blob/${DOCS_BRANCH}/docs/${projectPath(projectSlug, path.join("/"))}.md`;

  return (
    <DocPageContent
      source={page.content}
      headings={page.headings}
      breadcrumbs={breadcrumbs}
      githubUrl={githubUrl}
    />
  );
}
