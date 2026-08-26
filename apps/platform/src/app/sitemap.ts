import type { MetadataRoute } from "next";
import { env } from "~/env";
import { docsHref } from "~/lib/docsSlug";
import type { DocsTreeNode } from "~/lib/docsTree";
import { getDocsProjects, getDocsTree } from "~/server/docs/queries";
import {
  getJudgedCompetitionSlugs,
  getMeetingSlugs,
} from "~/server/loaders/meetings";

/**
 * /sitemap.xml — every public URL this app serves.
 *
 * Two halves, and the split is the whole design of this file:
 *
 *   - Everything derivable WITHOUT a database: the seven authored routes, plus
 *     every docs page, which `@devdogsuga/docs` compiles into the bundle at
 *     build time (see `server/docs/queries.ts`) — an in-memory walk over a
 *     constant that cannot throw and cannot be slow.
 *   - Everything that needs a query: meetings and judged competitions.
 *
 * The second half is wrapped so that a database that is down, unreachable, or
 * simply not configured costs the sitemap those URLs and nothing else. That
 * matters more here than on a page: `next build` prerenders this route, so an
 * uncaught throw is a FAILED BUILD rather than a degraded response — and this
 * app is built in CI jobs that have no database at all. At runtime the same
 * catch turns a Postgres blip during a crawl into a short sitemap instead of a
 * 500, which Google treats as an error for the whole file rather than for the
 * entries it could not fetch.
 *
 * Nothing carries `lastModified`. `meetings` and `competitions` are synced from
 * Airtable and have no `updatedAt` column, docs pages carry no date through the
 * build, and a `<lastmod>` derived from something else — a meeting's `endsAt`,
 * the time the sitemap happened to render — is a claim about revision history
 * that this app cannot make. Google reads `lastmod` only where it trusts it, so
 * an invented one is strictly worse than none.
 */

/**
 * `BASE_URL` is required in every deployed environment and defaults to
 * http://localhost:3000 in development, so there is no fallback to write. The
 * trailing slash is stripped because every path below opens with one, and a
 * sitemap that emits `https://devdogsuga.org//events` names a URL the app does
 * not serve. `metadataBase` does this job for the `metadata` exports; a sitemap
 * gets no such resolution and has to carry absolute URLs itself.
 */
const BASE = env.BASE_URL.replace(/\/$/, "");

const url = (path: string) => `${BASE}${path}`;

/**
 * The routes that exist whatever the database says.
 *
 * `/community` and `/partners` currently render the under-construction
 * placeholder, and `/` and `/events` do so in production builds. They are still
 * listed: a sitemap names URLs, not the state of what is behind them today, and
 * a list that changed shape with `DEPLOY_ENV` would quietly drop the club's
 * whole marketing site from production's sitemap — the one environment where it
 * is read. Every one of these is reachable from `config/nav.ts` without a
 * session.
 */
const STATIC_ROUTES: MetadataRoute.Sitemap = [
  { url: url("/"), changeFrequency: "monthly", priority: 1 },
  { url: url("/events"), changeFrequency: "weekly", priority: 0.9 },
  { url: url("/docs"), changeFrequency: "weekly", priority: 0.8 },
  { url: url("/community"), changeFrequency: "monthly", priority: 0.7 },
  { url: url("/partners"), changeFrequency: "monthly", priority: 0.7 },
  // Its own URL because it is handed around on its own — pasted into Discord,
  // printed as a QR code — which is the same reason it carries its own
  // metadata. The `?b=` variants are deliberately absent: they are one page
  // serving ten buildings, and the bare URL is the canonical one.
  { url: url("/events/directions"), changeFrequency: "yearly", priority: 0.4 },
  { url: url("/legal/privacy"), changeFrequency: "yearly", priority: 0.3 },
];

/**
 * Every docs page, from the same bundled artifact the pages read.
 *
 * Pages only. `/docs/[project]` redirects to the project's first page, and a
 * folder that has an index page redirects to it, so listing either would fill
 * the sitemap with URLs that answer 307 — the crawler follows them and indexes
 * the target, which is already here under its own name. A folder WITHOUT an
 * index page does render something of its own, but it is a contents grid over
 * pages this loop has already enumerated.
 */
function docsRoutes(): MetadataRoute.Sitemap {
  const routes: MetadataRoute.Sitemap = [];

  function collect(project: string, nodes: DocsTreeNode[]) {
    for (const node of nodes) {
      if (node.type === "page") {
        routes.push({
          url: url(docsHref(project, node.path.split("/"))),
          changeFrequency: "weekly",
          priority: 0.6,
        });
      } else {
        collect(project, node.children);
      }
    }
  }

  for (const project of getDocsProjects()) {
    collect(project.slug, getDocsTree(project.slug));
  }

  return routes;
}

/**
 * The database-backed half, or as much of it as answered.
 *
 * The two reads are independent, so they are settled separately rather than
 * awaited together: a competitions query that fails should not also cost the
 * sitemap every meeting. `Promise.allSettled` is what makes that true while
 * still issuing both at once.
 *
 * Both failures are logged rather than swallowed silently. A sitemap that
 * quietly shrank to its static half is indistinguishable from one that is
 * correct, and the symptom — pages falling out of the index — arrives weeks
 * later with nothing to read.
 */
async function databaseRoutes(): Promise<MetadataRoute.Sitemap> {
  const [meetings, competitions] = await Promise.allSettled([
    getMeetingSlugs(),
    getJudgedCompetitionSlugs(),
  ]);

  const routes: MetadataRoute.Sitemap = [];

  if (meetings.status === "fulfilled") {
    for (const slug of meetings.value) {
      routes.push({
        // A meeting page is written once and then only corrected, so `monthly`
        // is closer to the truth than the `weekly` the schedule itself gets.
        url: url(`/events/${encodeURIComponent(slug)}`),
        changeFrequency: "monthly",
        priority: 0.5,
      });
    }
  } else {
    console.error("[sitemap] meeting enumeration failed", meetings.reason);
  }

  if (competitions.status === "fulfilled") {
    for (const slug of competitions.value) {
      routes.push({
        // Results are final once the tally has run; the page exists to be
        // linked back to rather than revisited.
        url: url(`/competitions/${encodeURIComponent(slug)}/results`),
        changeFrequency: "yearly",
        priority: 0.5,
      });
    }
  } else {
    console.error(
      "[sitemap] competition enumeration failed",
      competitions.reason,
    );
  }

  return routes;
}

/**
 * An hour, rather than the default of "once, at build".
 *
 * Meetings reach this app through the Airtable sync, which runs every fifteen
 * minutes and is not tied to a deploy — so a sitemap frozen at build time stops
 * naming new meetings the moment an officer schedules one. A TTL is the only
 * mechanism available: `revalidateTag` is inert on the Cloudflare adapter,
 * whose `tagCache` is `"dummy"` (the same reason `events/layout.tsx` reaches
 * for `cacheLife` rather than a tag), so there is no push invalidation to hang
 * this off. An hour is well inside how often anything recrawls a sitemap and
 * costs at most 24 pairs of queries a day.
 *
 * It is also what recovers from a build that ran without a database: the
 * fallback above is what gets prerendered, and the first revalidation after
 * deploy replaces it with the full list.
 */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return [...STATIC_ROUTES, ...docsRoutes(), ...(await databaseRoutes())];
}
