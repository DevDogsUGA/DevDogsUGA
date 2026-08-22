import { notFound, redirect } from "next/navigation";
import { docsHref } from "~/lib/docsSlug";
import { firstPagePath } from "~/lib/docsTree";
import { getDocsProjects, getDocsTree } from "~/server/docs/queries";

export function generateStaticParams() {
  return getDocsProjects().map((project) => ({ project: project.slug }));
}

export default async function DocsProjectPage({
  params,
}: PageProps<"/docs/[project]">) {
  const { project } = await params;
  const projectSlug = decodeURIComponent(project);

  // Projects come from the bundled artifact, so an unrecognised slug is a 404
  // rather than an empty project.
  if (!getDocsProjects().some((p) => p.slug === projectSlug)) notFound();

  const first = firstPagePath(getDocsTree(projectSlug));

  if (first) {
    redirect(docsHref(projectSlug, first.split("/")));
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-1.5 px-6 py-10 lg:px-10">
      <h1 className="font-display text-2xl font-bold text-white">
        Nothing here yet
      </h1>
      <p className="max-w-prose text-sm text-mauve-400">
        This project hasn&rsquo;t published any documentation. Add markdown
        files under its{" "}
        <code className="rounded-sm border border-mauve-700 bg-mauve-800 px-1.5 py-0.5 font-mono text-xs text-white">
          docs/{projectSlug}/
        </code>{" "}
        directory to get started.
      </p>
    </div>
  );
}
