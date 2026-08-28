import { asc, eq, inArray, sql } from "drizzle-orm";
import { cacheLife } from "next/cache";
import { db } from "~/server/db";
import { env } from "~/env";
import { profileLinks, profiles, roles, userRoles } from "~/server/db/schema";
import type { LeaderProfile } from "~/components/LeadershipSection/LeaderCluster/LeaderHoverCard";

/**
 * The executive board for the homepage's Leadership section.
 *
 * Officers are members, so there is no officer table: this is
 * `platform.profile` joined to the roles its holder has been given, filtered
 * to the roles marked `isLeadership`. Being on the homepage is therefore the
 * same fact as holding a leadership role, rather than a second list that can
 * disagree with the first -- assigning the role puts someone here, and
 * removing it takes them off.
 *
 * `roles.rank` is the order. It is the same rank the console's role list is
 * dragged into, so the board is arranged where roles are already arranged, and
 * an officer holding two leadership roles sorts by the higher of them.
 *
 * The RLS on `profile` only lets a member read their own row, and on
 * `userRoles` denies client reads entirely. This is not a hole in either:
 * drizzle connects with `DB_URL` as the owner and is not subject to them, and
 * this function runs on the server inside the homepage's prerendered shell.
 * What reaches the browser is the projection below and nothing else -- notably
 * not `bio`, `legalFirstName`, `ugaEmail` or anything else on the row.
 *
 * `cacheLife` rather than a tag, for the reason `(site)/events/layout.tsx`
 * gives: the Cloudflare adapter's `tagCache` is `"dummy"`, so `revalidateTag`
 * is inert and freshness has to come from a TTL. An hour, because officers
 * edit their own role descriptions from /account and should not have to wait
 * for a deploy to see it, while the board itself changes once a year.
 */
export async function getCurrentOfficers(): Promise<LeaderProfile[]> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 3600, expire: 86_400 });

  const rows = await db
    .select({
      userId: profiles.userId,
      name: profiles.preferredName,
      roleDescription: profiles.roleDescription,
      pronouns: profiles.pronouns,
      graduationYear: profiles.graduationYear,
      majors: profiles.majors,
      minors: profiles.minors,
      certificates: profiles.certificates,
      // An officer can hold more than one leadership role; the card prints
      // every title. Ordered by rank so the senior one reads first.
      titles: sql<
        string[]
      >`array_agg(${roles.title} order by ${roles.rank} asc)`.as("titles"),
      rank: sql<number>`min(${roles.rank})`.as("rank"),
    })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .innerJoin(profiles, eq(profiles.userId, userRoles.userId))
    .where(eq(roles.isLeadership, true))
    .groupBy(profiles.userId)
    .orderBy(sql`min(${roles.rank}) asc`);

  if (rows.length === 0) return [];

  // Second query rather than a join: joining a one-to-many onto an already
  // grouped result multiplies the rows and would need a second aggregate to
  // undo. Officers are a handful of people once an hour.
  const links = await db
    .select({
      userId: profileLinks.userId,
      title: profileLinks.title,
      url: profileLinks.url,
    })
    .from(profileLinks)
    .where(
      inArray(
        profileLinks.userId,
        rows.map((row) => row.userId),
      ),
    )
    .orderBy(asc(profileLinks.sortOrder));

  const linksByUser = new Map<string, { title: string; url: string }[]>();
  for (const link of links) {
    const list = linksByUser.get(link.userId) ?? [];
    list.push({ title: link.title, url: link.url });
    linksByUser.set(link.userId, list);
  }

  return rows.map((row) => ({
    slug: row.userId,
    name: row.name,
    titles: row.titles,
    // The `avatars` bucket is keyed by the bare user id -- the same URL
    // `useAvatarSrc` builds -- so an officer who changes their avatar from
    // /account changes their card. Missing objects 404 and the card falls
    // back to initials.
    imageSrc: `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${env.NEXT_PUBLIC_AVATARS_BUCKET}/${row.userId}`,
    // Stored as an array of the words -- ["he","him"] -- and printed the way
    // it is written. Null when unset, which is every officer today.
    pronouns:
      row.pronouns && row.pronouns.length > 0 ? row.pronouns.join("/") : null,
    year: row.graduationYear === null ? null : String(row.graduationYear),
    majors: row.majors,
    minors: row.minors,
    certificates: row.certificates,
    // `roleDescription`, not `bio`: the 127-character `bio` is the blurb on a
    // member's own profile, while this is the officer bio written for this
    // section. Null until the officer writes one.
    bio: row.roleDescription,
    links: linksByUser.get(row.userId) ?? [],
  }));
}
