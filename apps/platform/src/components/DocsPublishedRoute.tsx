import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import DocPageContent from "~/components/DocPageContent";
import DocsFolderContents from "~/components/DocsFolderContents";
import StepPager from "~/components/DocsProgress/StepPager";
import DocsSidebar from "~/components/DocsSidebar";
import DocsVariants from "~/components/DocsVariants";
import "~/components/Docs/docs.css";
import { docsHref } from "~/lib/docsSlug";
import { findFolder, firstPagePath, indexPageOf } from "~/lib/docsTree";
import { toTitleCase } from "~/lib/toTitleCase";
import {
  getDocsProjects,
  getDocsVariantGroups,
  type DocsFolderEntry,
} from "~/server/docs/queries";
import { getContributeMenu, getDocsSwitcher } from "~/server/docs/menu";
import { getPublishedProject } from "~/server/docs/published";
import {
  pageHtml,
  publishedSidebar,
  publishedStepNav,
  publishedTree,
  type PublishedProject,
} from "~/server/docs/published/view";

/**
 * The docs routes for a project published through the docs pipeline
 * (`docs/operations/project-docs.md`), used when the slug is not one of the
 * club's own bundled projects. Same chrome as `DocsRoute`, over the compiled
 * pages read from the bucket.
 */

/** Null when `slug` is a bundled project (the caller handles it) or nothing is published under it. */
export async function loadPublishedFor(
  slug: string,
): Promise<PublishedProject | null> {
  if (getDocsProjects().some((p) => p.slug === slug)) return null;
  return getPublishedProject(slug);
}

export async function PublishedLayout({
  project,
  children,
}: {
  project: PublishedProject;
  children: ReactNode;
}) {
  const [switcher, contribute] = await Promise.all([
    getDocsSwitcher(),
    getContributeMenu(),
  ]);
  // A published project is a Project, so it is named and marked by its own row.
  const own = contribute.find((entry) => entry.project === project.slug);
  const groups = getDocsVariantGroups();
  return (
    <DocsVariants
      offered={{ os: project.os, supabase: groups.supabase.values }}
      className="docs-layout"
    >
      <DocsSidebar
        projects={[
          ...switcher,
          {
            slug: project.slug,
            name: own?.name ?? project.name,
            description: own ? own.description : project.description,
            mark: own?.mark ?? { kind: "fallback" },
          },
        ]}
        project={project.slug}
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

export function PublishedIndex({ project }: { project: PublishedProject }) {
  const first = firstPagePath(publishedTree(project));
  if (first) redirect(docsHref(project.slug, first.split("/"), project.base));
  return (
    <div className="docs-main docs-prose">
      <h1>Nothing here yet</h1>
      <p>This project hasn&rsquo;t published any pages.</p>
    </div>
  );
}

export function publishedMetadata(
  project: PublishedProject,
  slug: string[],
): Metadata {
  const path = slug.join("/");
  const page = project.pages.get(path);
  if (page) {
    return {
      title: `${page.title} | ${project.name} docs`,
      description: page.description ?? undefined,
    };
  }
  const folder = findFolder(publishedTree(project), path);
  return folder ? { title: `${folder.name} | ${project.name} docs` } : {};
}

export function PublishedPageRoute({
  project,
  slug: path,
  notice,
}: {
  project: PublishedProject;
  slug: string[];
  /** A note above the page, such as the live preview's. */
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
      title={page.title}
      eyebrow={
        stepNav && `Step ${stepNav.index + 1} of ${stepNav.steps.length}`
      }
      footer={
        stepNav && (
          <StepPager project={project.slug} base={project.base} {...stepNav} />
        )
      }
    />
  );
}
