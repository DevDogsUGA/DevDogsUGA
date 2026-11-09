import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "~/server/db";
import { memberStars, profileLinks, publicProfiles } from "~/server/db/schema";
export interface ClassicProfileActivity {
  links: { title: string; url: string }[] | null;
  stars: { meetingStars: number } | null;
}
/** Resolve visibility through today's public view before reading links or stars. */
export async function getClassicProfileActivity(
  handle: string,
): Promise<ClassicProfileActivity | null> {
  const [member] = await db
    .select({
      userId: publicProfiles.userId,
      showLinks: publicProfiles.showLinks,
      showStars: publicProfiles.showStars,
    })
    .from(publicProfiles)
    .where(eq(publicProfiles.handle, handle.trim().toLowerCase()));
  if (!member?.userId) return null;
  const userId = member.userId;
  const [links, stars] = await Promise.all([
    member.showLinks
      ? db
          .select({ title: profileLinks.title, url: profileLinks.url })
          .from(profileLinks)
          .where(eq(profileLinks.userId, userId))
          .orderBy(asc(profileLinks.sortOrder))
      : null,
    member.showStars
      ? db
          .select({ meetingStars: sql<number>`count(*)::int` })
          .from(memberStars)
          .where(eq(memberStars.userId, userId))
      : null,
  ]);
  return { links, stars: stars?.[0] ?? null };
}
