import { notFound, redirect } from "next/navigation";
import { docsHref } from "~/lib/docsSlug";
import { firstPagePath } from "~/lib/docsTree";
import { getDocsBranches, getDocsRepos, getDocsTree } from "~/server/docs/queries";

export async function generateStaticParams() {
  const repos = await getDocsRepos();
  return repos.map((repo) => ({ repo: repo.slug }));
}

export default async function DocsRepoPage({
  params,
}: PageProps<"/docs/[repo]">) {
  const { repo } = await params;
  const repoSlug = decodeURIComponent(repo);

  const branches = await getDocsBranches(repoSlug);
  if (!branches) notFound();

  const tree = await getDocsTree(repoSlug, branches.defaultBranch);
  const first = firstPagePath(tree);

  if (first) {
    redirect(
      docsHref(
        repoSlug,
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
        This repository hasn&rsquo;t published any documentation. Add markdown
        files to its <code className="font-mono">docs/</code> directory to get
        started.
      </p>
    </div>
  );
}
