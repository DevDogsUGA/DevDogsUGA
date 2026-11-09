import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import DocPageContent from "~/classic/components/DocPageContent";
import DocsFolderContents from "~/classic/components/DocsFolderContents";
import StepPager from "~/classic/components/DocsProgress/StepPager";
import DocsSidebar from "~/classic/components/DocsSidebar";
import DocsVariants from "~/classic/components/DocsVariants";
import { DOCS_PREVIEW_BASE, docsHref } from "~/lib/docsSlug";
import { findFolder, firstPagePath, indexPageOf } from "~/lib/docsTree";
import { toTitleCase } from "~/lib/toTitleCase";
import { requirePreviewProject } from "~/server/docs/previewAccess";
import {
  livePreviews,
  type LivePreview,
  type PreviewFailure,
} from "~/server/docs/livePreview";
import {
  getDocsVariantGroups,
  type DocsFolderEntry,
} from "~/server/docs/queries";
import {
  buildPublishedProject,
  pageHtml,
  publishedSidebar,
  publishedStepNav,
  publishedTree,
  type PublishedProject,
} from "~/server/docs/published/view";

/**
 * `/dashboard/docs-preview/<slug>`: a project's docs as they are on its
 * repository's default branch right now, in the docs' own layout.
 *
 * Who may see it is `previewAccess.ts`'s; what is shown is
 * `server/docs/previewLoader.ts`'s, the same compile the publishing pipeline
 * runs, so a page that renders here is one it will accept. Never cached (the
 * routes are `force-dynamic`): the answer depends on who is asking.
 */

/** Said on every page: why a code block here is plainer than it will be live. */
export const PREVIEW_NOTE =
  "Preview of the default branch. Code highlighting appears in the published copy.";

/** The images of one commit's preview: the route that serves them is `docs-preview-assets`. */
export const previewAssetUrl = (
  slug: string,
  sha: string,
  assetPath: string,
): string =>
  `/dashboard/docs-preview-assets/${encodeURIComponent(slug)}/${sha}/${assetPath
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;

type Loaded =
  | { kind: "page"; project: PublishedProject; preview: LivePreview }
  | { kind: "problems"; preview: LivePreview }
  | { kind: "unavailable"; failure: PreviewFailure };

async function load(slug: string): Promise<Loaded> {
  const { project } = await requirePreviewProject(slug);
  const result = await livePreviews().load({ slug, repoId: project.repoId });
  if (!result.ok) return { kind: "unavailable", failure: result.failure };
  const { preview } = result;
  if (preview.content === null) return { kind: "problems", preview };
  return {
    kind: "page",
    preview,
    project: buildPublishedProject(
      {
        version: 1,
        project: slug,
        // Nothing is published: the commit stands where a version's digest would.
        digest: preview.sha.padEnd(64, "0"),
        sha: preview.sha,
        repository: preview.repository,
        destination: `${DOCS_PREVIEW_BASE}/${slug}`,
        publishedAt: "",
      },
      preview.content,
      {
        base: DOCS_PREVIEW_BASE,
        assetHref: (assetPath) => previewAssetUrl(slug, preview.sha, assetPath),
      },
    ),
  };
}

const CENTRED =
  "mx-auto flex w-full max-w-3xl flex-col gap-1.5 px-6 py-10 lg:px-10";
const HEADING = "font-display text-2xl font-bold text-white";

/** Why there is nothing to show, to a member who is allowed to ask. */
function Unavailable({
  loaded,
}: {
  loaded: Exclude<Loaded, { kind: "page" }>;
}) {
  if (loaded.kind === "unavailable") {
    return (
      <div className={CENTRED}>
        <h1 className={HEADING}>Preview unavailable</h1>
        <p className="max-w-prose text-sm text-mauve-400">
          {loaded.failure.message}
        </p>
      </div>
    );
  }
  const { readiness, sha } = loaded.preview;
  return (
    <div className={CENTRED}>
      <h1 className={HEADING}>These docs don&rsquo;t compile yet</h1>
      <p className="max-w-prose text-sm text-mauve-400">
        The default branch at{" "}
        <code className="rounded-sm border border-mauve-700 bg-mauve-800 px-1.5 py-0.5 font-mono text-xs text-white">
          {sha.slice(0, 7)}
        </code>{" "}
        has problems the publishing build would refuse:
      </p>
      <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-sm text-mauve-300">
        {readiness.problems.map((problem, i) => (
          <li key={i}>
            {problem.file && (
              <code className="rounded-sm border border-mauve-700 bg-mauve-800 px-1.5 py-0.5 font-mono text-xs text-white">
                {problem.file}
              </code>
            )}{" "}
            {problem.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

export async function PreviewLayout({
  slug,
  children,
}: {
  slug: string;
  children: ReactNode;
}) {
  const loaded = await load(slug);
  if (loaded.kind !== "page") return <>{children}</>;
  const { project } = loaded;
  const groups = getDocsVariantGroups();
  return (
    <DocsVariants
      offered={{ os: project.os, supabase: groups.supabase.values }}
      className="flex min-w-0 flex-1 items-start max-lg:flex-col"
    >
      <DocsSidebar
        projects={[
          {
            slug,
            name: project.name,
            description: project.description,
          },
        ]}
        project={slug}
        platforms={project.os.map((value) => ({
          value,
          label: groups.os.labels[value] ?? value,
        }))}
        tree={publishedSidebar(project)}
        base={project.base}
      />
      <div className="flex min-w-0 flex-1 flex-col self-stretch">
        {children}
      </div>
    </DocsVariants>
  );
}

function PublishedIndex({ project }: { project: PublishedProject }) {
  const first = firstPagePath(publishedTree(project));
  if (first) redirect(docsHref(project.slug, first.split("/"), project.base));
  return (
    <div className={CENTRED}>
      <h1 className={HEADING}>Nothing here yet</h1>
      <p className="max-w-prose text-sm text-mauve-400">
        This project hasn&rsquo;t published any pages.
      </p>
    </div>
  );
}

export async function PreviewIndex({ slug }: { slug: string }) {
  const loaded = await load(slug);
  if (loaded.kind !== "page") return <Unavailable loaded={loaded} />;
  return <PublishedIndex project={loaded.project} />;
}

function PublishedPageRoute({
  project,
  slug: path,
  notice,
}: {
  project: PublishedProject;
  slug: string[];
  notice?: ReactNode;
}) {
  const joined = path.join("/");
  const tree = publishedTree(project);
  const breadcrumbs = [
    project.name,
    ...path
      .slice(0, -1)
      .map(
        (segment, i) =>
          findFolder(tree, path.slice(0, i + 1).join("/"))?.name ??
          toTitleCase(segment),
      ),
  ];

  const page = project.pages.get(joined);
  if (!page) {
    const folder = findFolder(tree, joined);
    if (!folder) notFound();
    const index = indexPageOf(folder);
    if (index)
      redirect(docsHref(project.slug, index.path.split("/"), project.base));
    const entries: DocsFolderEntry[] = folder.children.map((node) =>
      node.type === "folder"
        ? {
            kind: "folder",
            path: node.path,
            title: node.name,
            description: null,
          }
        : {
            kind: "page",
            path: node.path,
            title: node.title,
            description: project.pages.get(node.path)?.description ?? null,
          },
    );
    return (
      <DocsFolderContents
        project={project.slug}
        title={folder.name}
        breadcrumbs={breadcrumbs}
        entries={entries}
        base={project.base}
      />
    );
  }

  const stepNav = publishedStepNav(project, joined);
  return (
    <DocPageContent
      external
      notice={notice}
      html={pageHtml(project, page)}
      headings={page.headings}
      breadcrumbs={breadcrumbs}
      footer={
        stepNav && (
          <StepPager project={project.slug} base={project.base} {...stepNav} />
        )
      }
    />
  );
}

export async function PreviewPage({
  slug,
  path,
}: {
  slug: string;
  path: string[];
}) {
  const loaded = await load(slug);
  if (loaded.kind !== "page") return <Unavailable loaded={loaded} />;
  return (
    <PublishedPageRoute
      project={loaded.project}
      slug={path}
      notice={PREVIEW_NOTE}
    />
  );
}

export async function previewMetadata(
  slug: string,
  path: string[],
): Promise<Metadata> {
  const loaded = await load(slug);
  const title =
    loaded.kind === "page"
      ? loaded.project.pages.get(path.join("/"))?.title
      : undefined;
  return {
    title: `${title ?? "Preview"} | DevDogs Docs preview`,
    robots: { index: false, follow: false },
  };
}
