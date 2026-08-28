import { and, asc, eq } from "drizzle-orm";
import { cacheLife } from "next/cache";
import { db } from "~/server/db";
import { env } from "~/env";
import { CURRENT_OFFICER_TERM, officers } from "~/server/db/schema";
import type { LeaderProfile } from "~/components/LeadershipSection/LeaderCluster/LeaderHoverCard";

/**
 * The executive board for the homepage's Leadership section.
 *
 * `cacheLife` rather than a tag, for the reason spelled out in
 * `(site)/events/layout.tsx`: the Cloudflare adapter's `tagCache` is
 * `"dummy"`, so `revalidateTag` is inert and freshness has to come from a TTL.
 *
 * The numbers are much longer than the events page's because the data is much
 * slower. A board changes once a year; within a year it changes when an
 * officer sends a better headshot or finally answers with their pronouns.
 * An hour is short enough that such an edit lands without a deploy and long
 * enough that the front page is not querying Postgres for prose that has been
 * identical since July.
 *
 * Anonymous visitors can read this table directly under RLS, but the read
 * happens here, on the server, inside the prerendered shell — the homepage is
 * `"use cache"` end to end and a client-side fetch would punch a hole in it.
 */
export async function getCurrentOfficers(): Promise<LeaderProfile[]> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 3600, expire: 86_400 });

  const rows = await db
    .select({
      slug: officers.slug,
      displayName: officers.displayName,
      titles: officers.titles,
      majors: officers.majors,
      minors: officers.minors,
      certificates: officers.certificates,
      pronouns: officers.pronouns,
      gradYear: officers.gradYear,
      bio: officers.bio,
      headshotPath: officers.headshotPath,
      headshotBlurDataUrl: officers.headshotBlurDataUrl,
      portfolioUrl: officers.portfolioUrl,
      githubUrl: officers.githubUrl,
      linkedinUrl: officers.linkedinUrl,
      email: officers.email,
    })
    .from(officers)
    .where(
      and(eq(officers.term, CURRENT_OFFICER_TERM), eq(officers.active, true)),
    )
    .orderBy(asc(officers.sortOrder));

  return rows.map((row) => ({
    slug: row.slug,
    name: row.displayName,
    titles: row.titles,
    majors: row.majors,
    minors: row.minors,
    certificates: row.certificates,
    // Null all the way through rather than defaulted: the card omits the line
    // entirely, which is the honest rendering of "no officer told us".
    pronouns: row.pronouns,
    year: row.gradYear,
    bio: row.bio,
    // The row stores a bucket key, not a URL, so that the same seed works
    // against staging and production. The origin is composed here, where the
    // deployment's own Supabase URL is in scope. `next.config.ts` already
    // allows this host under `images.remotePatterns`.
    imageSrc: row.headshotPath
      ? `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${env.NEXT_PUBLIC_LEADERSHIP_BUCKET}/${row.headshotPath}`
      : null,
    imageBlurDataUrl: row.headshotBlurDataUrl,
    portfolioUrl: row.portfolioUrl,
    githubUrl: row.githubUrl,
    linkedinUrl: row.linkedinUrl,
    email: row.email,
  }));
}
