import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import DocPageContent from "~/components/DocPageContent";
import DocsFolderContents from "~/components/DocsFolderContents";
import StepPager from "~/components/DocsProgress/StepPager";
import DocsScheduled from "~/components/DocsScheduled";
import DocsSidebar from "~/components/DocsSidebar";
import DocsVariants from "~/components/DocsVariants";
import "~/components/Docs/docs.css";
import { DOCS_BRANCH, DOCS_REPO, docsProjectHue } from "~/config/docs";
import {
  loadPublishedFor,
  PublishedIndex,
  PublishedLayout,
  PublishedPageRoute,
  publishedMetadata,
} from "~/components/DocsPublishedRoute";
import { env } from "~/env";
import { getDocsSwitcher } from "~/server/docs/menu";
import {
  DOCS_BASE,
  DOCS_PREVIEW_BASE,
  docsHref,
  projectPath,
} from "~/lib/docsSlug";
import { firstPagePath, findFolder, indexPageOf } from "~/lib/docsTree";
import { toTitleCase } from "~/lib/toTitleCase";
import {
  getDocsFolder,
  getDocsFolderEntries,
  getDocsPage,
  getDocsSidebarTree,
  getDocsStepNav,
  getDocsTree,
  getDocsVariantGroups,
  getVisibleDocsProjects,
  type DocsMode,
} from "~/server/docs/queries";

/**
 * The docs routes, shared by `/docs` and `/dashboard/docs-preview`.
 *
 * The two are the same pages over two readings of the same data: the public
 * one shows what is live, the preview shows everything and marks what is not
 * live yet. Keeping one implementation is what makes "the preview looks like
 * the real thing" true rather than a promise, and the mode is the only thing
 * that differs between the callers. The routes themselves stay separate, so
 * that the public one can be cached and the preview never is.
 */

const baseOf = (mode: DocsMode) =>
  mode === "preview" ? DOCS_PREVIEW_BASE : DOCS_BASE;

export async function DocsProjectLayout({
  project,
  mode,
  children,
}: {
  project: string;
  mode: DocsMode;
  children: ReactNode;
}) {
  const projects = await getVisibleDocsProjects(mode);
  const current = projects.find((p) => p.slug === project);

  // Not one of ours: a project published through the docs pipeline, if there
  // is one under this slug. Otherwise let the page render its notFound
  // without docs chrome.
  if (!current) {
    const published =
      mode === "public" ? await loadPublishedFor(project) : null;
    if (published) {
      return <PublishedLayout project={published}>{children}</PublishedLayout>;
    }
    return <>{children}</>;
  }

  const groups = getDocsVariantGroups();

  return (
    <DocsVariants
      offered={{ os: current.os, supabase: groups.supabase.values }}
      className="docs-layout"
      kind={docsProjectHue(project)}
    >
      <DocsSidebar
        projects={await getDocsSwitcher(mode)}
        project={project}
        platforms={current.os.map((value) => ({
          value,
          label: groups.os.labels[value] ?? value,
        }))}
        tree={await getDocsSidebarTree(project, mode)}
        base={baseOf(mode)}
      />
      <div className="docs-pagecol">{children}</div>
    </DocsVariants>
  );
}

/** `/docs/<project>`: on to the project's first page, or say there is none. */
export async function DocsProjectIndex({
  project,
  mode,
}: {
  project: string;
  mode: DocsMode;
}) {
  // Projects come from the bundled artifact, so an unrecognised slug is a 404
  // rather than an empty project. So is one with nothing live yet.
  if (!(await getVisibleDocsProjects(mode)).some((p) => p.slug === project)) {
    const published =
      mode === "public" ? await loadPublishedFor(project) : null;
    if (published) return <PublishedIndex project={published} />;
    notFound();
  }

  const first = firstPagePath(await getDocsTree(project, mode));

  if (first) {
    redirect(docsHref(project, first.split("/"), baseOf(mode)));
  }

  return (
    <div className="docs-main docs-prose">
      <h1>Nothing here yet</h1>
      <p>
        This project hasn&rsquo;t published any documentation. Add markdown
        files under its <code>docs/{project}/</code> directory to get started.
      </p>
    </div>
  );
}

export async function docsPageMetadata({
  project,
  slug,
  mode,
}: {
  project: string;
  slug: string[];
  mode: DocsMode;
}): Promise<Metadata> {
  const path = slug.join("/");

  if (mode === "preview") {
    // Never a link card, never indexed: this is not the public copy.
    const page = await getDocsPage(project, path, mode);
    const folder = page ? null : await getDocsFolder(project, path, mode);
    return {
      title: `${page?.title ?? folder?.name ?? "Preview"} | DevDogs Docs preview`,
      robots: { index: false, follow: false },
    };
  }

  // The link card. Docs pages live under a catch-all, and Next refuses an
  // `opengraph-image.tsx` inside one ("Catch-all must be the last part of the
  // URL"), so this is the one public route whose card comes from a route
  // handler instead of the file convention. It takes the project and path
  // rather than a title, and looks them up itself — see the handler.
  const card = {
    images: [
      {
        url: `/og/docs?project=${encodeURIComponent(project)}&path=${encodeURIComponent(path)}`,
        width: 1200,
        height: 630,
      },
    ],
  };

  const page = await getDocsPage(project, path, mode);
  if (page) {
    return {
      title: `${page.title} | DevDogs Docs`,
      description: page.description ?? undefined,
      openGraph: card,
    };
  }

  const folder = await getDocsFolder(project, path, mode);
  if (folder) {
    return { title: `${folder.name} | DevDogs Docs`, openGraph: card };
  }

  // A published project's page: no link card, since the card route reads the
  // bundled docs only.
  const published = await loadPublishedFor(project);
  if (published) return publishedMetadata(published, slug);

  return {};
}

export async function DocsPageRoute({
  project,
  slug: path,
  mode,
}: {
  project: string;
  slug: string[];
  mode: DocsMode;
}) {
  const base = baseOf(mode);
  const joined = path.join("/");

  if (mode === "public") {
    const published = await loadPublishedFor(project);
    if (published)
      return <PublishedPageRoute project={published} slug={path} />;
  }

  // A page that is not live yet is not found, exactly as one that does not
  // exist: `getDocsPage` answers null for both.
  const page = await getDocsPage(project, joined, mode);
  // Each folder by its own name, which its settings may give it, rather than
  // its directory's.
  const tree = await getDocsTree(project, mode);
  const breadcrumbs = [
    toTitleCase(project),
    ...path
      .slice(0, -1)
      .map(
        (segment, i) =>
          findFolder(tree, path.slice(0, i + 1).join("/"))?.name ??
          toTitleCase(segment),
      ),
  ];

  if (!page) {
    // Not a page, but the sidebar links folders too, so it may be one.
    const folder = findFolder(tree, joined);
    if (!folder) notFound();

    // A folder with an index page has something better to show than a list of
    // itself, and that page is what the section means.
    const index = indexPageOf(folder);
    if (index) redirect(docsHref(project, index.path.split("/"), base));

    return (
      <DocsFolderContents
        project={project}
        title={folder.name}
        breadcrumbs={breadcrumbs}
        entries={getDocsFolderEntries(project, folder)}
        base={base}
      />
    );
  }

  // A mounted page's real source is the shared file the compiler copied it
  // from (contract item 2), not this project's own copy — see `mountedFrom`
  // on `DocsPageContent`.
  const sourcePath = page.mountedFrom ?? projectPath(project, joined);
  const githubUrl = `https://github.com/${env.GITHUB_ORG}/${DOCS_REPO}/blob/${DOCS_BRANCH}/docs/${sourcePath}.md`;
  const stepNav = await getDocsStepNav(project, joined, mode);

  return (
    <DocPageContent
      html={page.html}
      headings={page.headings}
      breadcrumbs={breadcrumbs}
      title={page.title}
      eyebrow={
        stepNav && `Step ${stepNav.index + 1} of ${stepNav.steps.length}`
      }
      githubUrl={githubUrl}
      notice={page.publishAt && <DocsScheduled at={page.publishAt} />}
      footer={
        stepNav && <StepPager project={project} base={base} {...stepNav} />
      }
    />
  );
}
