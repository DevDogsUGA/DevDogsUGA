import { notFound, redirect } from "next/navigation";
import { docsHref } from "~/lib/docsSlug";
import { firstPagePath } from "~/lib/docsTree";
import {
  getDocsBranches,
  getDocsProjects,
  getDocsTree,
} from "~/server/docs/queries";

export async function generateStaticParams() {
  const projects = await getDocsProjects();
  return projects.map((project) => ({ project: project.slug }));
}

export default async function DocsProjectPage({
  params,
}: PageProps<"/docs/[project]">) {
  const { project } = await params;
  const projectSlug = decodeURIComponent(project);

  const branches = await getDocsBranches();
  if (!branches) notFound();

  const tree = await getDocsTree(
    branches.repoSlug,
    projectSlug,
    branches.defaultBranch,
  );
  const first = firstPagePath(tree);

  if (first) {
    redirect(
      docsHref(
        projectSlug,
        branches.defaultBranch,
        first.split("/"),
        branches.defaultBranch,
      ),
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12">
      <h1 className="font-display text-2xl font-bold text-white">
        Nothing here yet
      </h1>
      <p className="mt-2 text-mauve-300">
        This project hasn&rsquo;t published any documentation. Add markdown
        files under its{" "}
        <code className="font-mono">docs/{projectSlug}/</code> directory to get
        started.
      </p>
    </div>
  );
}
