import type { Metadata } from "next";
import type { ReactNode } from "react";
import {
  PublishedIndex,
  PublishedPageRoute,
} from "~/components/DocsPublishedRoute";
import DocsSidebar from "~/components/DocsSidebar";
import DocsVariants from "~/components/DocsVariants";
import "~/components/Docs/docs.css";
import { DOCS_PREVIEW_BASE } from "~/lib/docsSlug";
import { requirePreviewProject } from "~/server/docs/previewAccess";
import {
  livePreviews,
  type LivePreview,
  type PreviewFailure,
} from "~/server/docs/livePreview";
import { getDocsVariantGroups } from "~/server/docs/queries";
import {
  buildPublishedProject,
  publishedSidebar,
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

/** Why there is nothing to show, to a member who is allowed to ask. */
function Unavailable({
  loaded,
}: {
  loaded: Exclude<Loaded, { kind: "page" }>;
}) {
  if (loaded.kind === "unavailable") {
    return (
      <div className="docs-main docs-prose">
        <h1>Preview unavailable</h1>
        <p>{loaded.failure.message}</p>
      </div>
    );
  }
  const { readiness, sha } = loaded.preview;
  return (
    <div className="docs-main docs-prose">
      <h1>These docs don&rsquo;t compile yet</h1>
      <p>
        The default branch at <code>{sha.slice(0, 7)}</code> has problems the
        publishing build would refuse:
      </p>
      <ul>
        {readiness.problems.map((problem, i) => (
          <li key={i}>
            {problem.file && <code>{problem.file}</code>} {problem.message}
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
      className="docs-layout"
    >
      <DocsSidebar
        projects={[
          {
            slug,
            name: project.name,
            description: project.description,
            mark: { kind: "fallback" },
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
      <div className="docs-pagecol">{children}</div>
    </DocsVariants>
  );
}

export async function PreviewIndex({ slug }: { slug: string }) {
  const loaded = await load(slug);
  if (loaded.kind !== "page") return <Unavailable loaded={loaded} />;
  return <PublishedIndex project={loaded.project} />;
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
