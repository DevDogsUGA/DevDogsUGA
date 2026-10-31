import type { MetadataRoute } from "next";
import { GDGC_ISSUES, ISSUES } from "@devdogsuga/newsletter";
import { env } from "~/env";
import { docsHref } from "~/lib/docsSlug";
import { getDocsPagePaths, getDocsProjects } from "~/server/docs/queries";
import { getMeetingSlugs } from "~/server/loaders/meetings";

/**
 * /sitemap.xml, every public URL this app serves.
 *
 * Two halves, and the split is the whole design of this file:
 *
 *   - Everything derivable WITHOUT a database: the authored routes, both
 *     newsletter archives and their issues (`@devdogsuga/newsletter`), plus
 *     every docs page, which `@devdogsuga/docs` compiles into the bundle at
 *     build time (see `server/docs/queries.ts`). In-memory walks over
 *     constants that cannot throw and cannot be slow.
 *   - Everything that needs a query: meetings.
 *
 * The second half is wrapped so a database that is down, unreachable, or not
 * configured costs the sitemap those URLs and nothing else. That matters more
 * here than on a page: `next build` prerenders this route, so an uncaught throw
 * is a FAILED BUILD rather than a degraded response, and CI builds this app in
 * jobs that have no database at all. At runtime the same catch turns a Postgres
 * blip during a crawl into a short sitemap instead of a 500, which Google
 * treats as an error for the whole file rather than for the entries it could
 * not fetch.
 *
 * Nothing carries `lastModified`. `meetings` reconciles from config and has
 * no `updatedAt` column; docs
 * pages carry no date through the build either, and a `<lastmod>` derived
 * from something else (a meeting's `endsAt`,
 * the time the sitemap happened to render) is a claim about revision history
 * this app cannot make. Google reads `lastmod` only where it trusts it, so an
 * invented one is worse than none.
 */

/**
 * `BASE_URL` is required in every deployed environment and defaults to
 * http://localhost:3000 in development, so there is no fallback to write. The
 * trailing slash is stripped because every path below opens with one, and a
 * sitemap that emits `https://devdogsuga.org//events` names a URL the app does
 * not serve. `metadataBase` does this job for the `metadata` exports; a sitemap
 * gets no such resolution and carries absolute URLs itself.
 */
const BASE = env.BASE_URL.replace(/\/$/, "");

const url = (path: string) => `${BASE}${path}`;

/**
 * The routes that exist whatever the database says.
 *
 * `/community` is absent because it redirects to the Involvement Network
 * roster in production. Every route here is reachable without a session.
 */
const STATIC_ROUTES: MetadataRoute.Sitemap = [
  { url: url("/"), changeFrequency: "monthly", priority: 1 },
  { url: url("/events"), changeFrequency: "weekly", priority: 0.9 },
  { url: url("/docs"), changeFrequency: "weekly", priority: 0.8 },
  { url: url("/partners"), changeFrequency: "monthly", priority: 0.7 },
  // Its own URL because it is handed around on its own, pasted into Discord or
  // printed as a QR code, which is the same reason it carries its own metadata.
  // The `?b=` variants are deliberately absent: they are one page serving ten
  // buildings, and the bare URL is the canonical one.
  { url: url("/events/directions"), changeFrequency: "yearly", priority: 0.4 },
  { url: url("/legal/privacy"), changeFrequency: "yearly", priority: 0.3 },
  { url: url("/legal/terms"), changeFrequency: "yearly", priority: 0.3 },
];

/**
 * Both newsletters: the Changelog and the GDGC newsletter, each archive and
 * every issue, from the same issue lists their pages prerender. An issue is
 * written once and then only corrected, so `yearly`; an archive gains an issue
 * with each send.
 */
function newsletterRoutes(): MetadataRoute.Sitemap {
  const series = [
    { base: "/changelog", issues: ISSUES },
    { base: "/newsletters/gdgc", issues: GDGC_ISSUES },
  ];
  return series.flatMap(({ base, issues }) => [
    { url: url(base), changeFrequency: "weekly" as const, priority: 0.5 },
    ...issues.map((issue) => ({
      url: url(`${base}/${issue.version}`),
      changeFrequency: "yearly" as const,
      priority: 0.4,
    })),
  ]);
}

/**
 * Every docs page, from the same bundled artifact the pages read.
 *
 * Pages only. `/docs/[project]` redirects to the project's first page, and a
 * folder that has an index page redirects to it, so listing either would fill
 * the sitemap with URLs that answer 307. The crawler follows them and indexes
 * the target, which is already here under its own name. A folder WITHOUT an
 * index page does render something of its own, but it is a contents grid over
 * pages this loop has already enumerated.
 */
async function docsRoutes(): Promise<MetadataRoute.Sitemap> {
  const routes: MetadataRoute.Sitemap = [];

  for (const project of getDocsProjects()) {
    for (const path of await getDocsPagePaths(project.slug)) {
      routes.push({
        url: url(docsHref(project.slug, path.split("/"))),
        changeFrequency: "weekly",
        priority: 0.6,
      });
    }
  }

  return routes;
}

/**
 * The database-backed half, or as much of it as answered.
 *
 * A failure is logged rather than swallowed. A sitemap that shrank to its
 * static half is indistinguishable from one that is correct, and the symptom
 * arrives weeks later with nothing to read: pages falling out of the index.
 */
async function databaseRoutes(): Promise<MetadataRoute.Sitemap> {
  try {
    return (await getMeetingSlugs()).map((slug) => ({
      // A meeting page is written once and then only corrected, so `monthly`
      // is closer to the truth than the `weekly` the schedule itself gets.
      url: url(`/events/${encodeURIComponent(slug)}`),
      changeFrequency: "monthly" as const,
      priority: 0.5,
    }));
  } catch (error) {
    console.error("[sitemap] meeting enumeration failed", error);
    return [];
  }
}

/**
 * An hour, rather than the default of "once, at build".
 *
 * Meetings reach this app through the config reconcile, which runs every
 * fifteen minutes and is not tied to a deploy, so a sitemap frozen at build time stops
 * naming new meetings the moment an officer schedules one. No sitemap-specific
 * push invalidation is wired, so this uses a TTL. An hour is well inside how
 * often anything recrawls a sitemap and costs at most 24 pairs of queries a
 * day. vinext's KV data adapter supports tag invalidation if the config
 * reconcile later starts emitting a tag this sitemap can consume.
 *
 * It also recovers from a build that ran without a database: the fallback above
 * is what gets prerendered, and the first revalidation after deploy replaces it
 * with the full list.
 */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return [
    ...STATIC_ROUTES,
    ...newsletterRoutes(),
    ...(await docsRoutes()),
    ...(await databaseRoutes()),
  ];
}
