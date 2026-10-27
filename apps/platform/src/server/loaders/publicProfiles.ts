import { and, asc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { cacheLife } from "next/cache";
import { cache } from "react";
import { env } from "~/env";
import { db } from "~/server/db";
import { profileLinks, publicProfiles } from "~/server/db/schema";
import {
  getContributionsForUser,
  type ContributionItem,
} from "./contributions";
import {
  DIRECTORY_PAGE_SIZE,
  escapeLike,
  pageBounds,
  type DirectoryQuery,
} from "~/lib/directoryQuery";
import { getStarsForUser, totalStars, type StarTotals } from "./stars";

/**
 * Reads for public member profiles.
 *
 * ONE RULE, ONE PLACE. Who counts as public (verified, `publicProfile` on, has
 * a handle, not quarantined, not suspended) is written once, in the
 * `platform."publicProfiles"` view. Nothing in this file restates it: every
 * function either selects from that view or resolves a member through it
 * first, so a member the view drops disappears from the profile page, the
 * directory, invite search and the activity lists together.
 *
 * ACCESS MODEL. The server connects to Postgres as `postgres`, which bypasses
 * RLS, and the view is granted to neither `anon` nor `authenticated`, so it is
 * unreachable from a browser. These loaders are therefore the only door.
 * Never read `profile`, `profileLinks` or `memberStars` for a public page
 * directly; go through here.
 *
 * `userId` is a join key, not public data. It stays out of `PublicProfile` and
 * the directory rows; only `PublicProfileMatch` carries it, because an invite
 * has to name an account. (An avatar URL is built from the id, so it is
 * recoverable for members who show an avatar. That is inherent to how the
 * `avatars` bucket is keyed, which is why a hidden avatar yields no URL at
 * all.)
 */

/** The avatar's public URL, same shape `useAvatarSrc` and the officers loader build. */
export function avatarUrlFor(userId: string): string {
  return `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${env.NEXT_PUBLIC_AVATARS_BUCKET}/${userId}`;
}

/**
 * Which parts of a profile the member has chosen to show. A null field next to
 * a `false` flag is hidden; next to a `true` flag it was simply never filled
 * in, so the page can say "no bio yet" for one and nothing for the other.
 */
export interface PublicProfileVisibility {
  name: boolean;
  avatar: boolean;
  bio: boolean;
  links: boolean;
  stars: boolean;
}

export interface PublicProfile {
  /** Lowercase, without the `@`. Build links with `profilePath`. */
  handle: string;
  /** Null when the member hides their name; show the handle instead. */
  displayName: string | null;
  /** Null when hidden or when no avatar was ever uploaded. */
  avatarUrl: string | null;
  bio: string | null;
  /** The longer officer-style description. Hidden together with `bio`. */
  roleDescription: string | null;
  githubHandle: string | null;
  discordHandle: string | null;
  linkedinName: string | null;
  /** Expected graduation year. Public whenever the profile is (Q103). */
  graduationYear: number | null;
  /** Major names (not minors or certificates), in the member's own order. */
  majors: string[];
  visibility: PublicProfileVisibility;
}

/** One row of the `/community` directory. */
export interface PublicProfileSummary {
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  graduationYear: number | null;
  majors: string[];
}

type ViewRow = typeof publicProfiles.$inferSelect;

function toProfile(row: ViewRow): PublicProfile {
  return {
    handle: row.handle!,
    displayName: row.displayName,
    avatarUrl: row.hasAvatar ? avatarUrlFor(row.userId!) : null,
    bio: row.bio,
    roleDescription: row.roleDescription,
    githubHandle: row.githubHandle,
    discordHandle: row.discordHandle,
    linkedinName: row.linkedinName,
    graduationYear: row.graduationYear,
    majors: row.majors ?? [],
    visibility: {
      name: row.showName!,
      avatar: row.showAvatar!,
      bio: row.showBio!,
      links: row.showLinks!,
      stars: row.showStars!,
    },
  };
}

/**
 * A public profile by handle, or null when there is no such public profile.
 * Null is deliberately the same answer for "no such handle", "member hid their
 * profile", "not verified" and "quarantined", so the page cannot be used to
 * tell those apart.
 *
 * `handle` is the bare handle (callers strip the `@`; see `handleFromSegment`)
 * and is matched case-insensitively.
 */
export const getPublicProfileByHandle = cache(
  async (handle: string): Promise<PublicProfile | null> => {
    const [row] = await db
      .select()
      .from(publicProfiles)
      .where(eq(publicProfiles.handle, handle.trim().toLowerCase()));
    return row ? toProfile(row) : null;
  },
);

export interface DirectoryPage {
  members: PublicProfileSummary[];
  /** Matches across all pages. */
  total: number;
  /** The page actually served, clamped into range. */
  page: number;
  totalPages: number;
}

/** Search, filter and one page of the directory. */
export interface DirectorySearch extends DirectoryQuery {
  /**
   * Drop members who hold a leadership role. The unfiltered directory lists
   * them in its own Leadership section instead of twice.
   */
  excludeLeadership?: boolean;
}

/**
 * One page of public profiles, alphabetical by what is shown (display name,
 * falling back to handle). The search matches the shown name and the handle,
 * case-insensitively, as a literal fragment (`%`, `_` and `\` are escaped). A
 * name the member hides is NULL in the view, so it can never be searched.
 */
export async function searchPublicProfiles(
  search: DirectorySearch,
  pageSize = DIRECTORY_PAGE_SIZE,
): Promise<DirectoryPage> {
  const conditions: SQL[] = [];
  if (search.q) {
    const pattern = `%${escapeLike(search.q)}%`;
    conditions.push(
      sql`(${publicProfiles.displayName} ilike ${pattern} escape '\\' or ${publicProfiles.handle} ilike ${pattern} escape '\\')`,
    );
  }
  if (search.leadership) conditions.push(eq(publicProfiles.isLeadership, true));
  else if (search.excludeLeadership)
    conditions.push(eq(publicProfiles.isLeadership, false));
  if (search.major)
    conditions.push(sql`${search.major} = any(${publicProfiles.majors})`);
  if (search.year !== null)
    conditions.push(eq(publicProfiles.graduationYear, search.year));
  const where = conditions.length ? and(...conditions) : undefined;

  const [counted] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(publicProfiles)
    .where(where);
  const total = counted?.total ?? 0;
  const { page, totalPages, offset } = pageBounds(search.page, total, pageSize);

  const rows = await db
    .select({
      userId: publicProfiles.userId,
      handle: publicProfiles.handle,
      displayName: publicProfiles.displayName,
      hasAvatar: publicProfiles.hasAvatar,
      bio: publicProfiles.bio,
      graduationYear: publicProfiles.graduationYear,
      majors: publicProfiles.majors,
    })
    .from(publicProfiles)
    .where(where)
    .orderBy(
      asc(
        sql`lower(coalesce(${publicProfiles.displayName}, ${publicProfiles.handle}))`,
      ),
      asc(publicProfiles.handle),
    )
    .limit(pageSize)
    .offset(offset);

  return {
    members: rows.map((row) => ({
      handle: row.handle!,
      displayName: row.displayName,
      avatarUrl: row.hasAvatar ? avatarUrlFor(row.userId!) : null,
      bio: row.bio,
      graduationYear: row.graduationYear,
      majors: row.majors ?? [],
    })),
    total,
    page,
    totalPages,
  };
}

/**
 * Every public profile, unpaginated and alphabetical. Not used by the
 * directory (which pages through `searchPublicProfiles`); kept for the db tests
 * that assert who is visible at all.
 */
export async function listPublicProfiles(): Promise<PublicProfileSummary[]> {
  const { members } = await searchPublicProfiles(
    { q: "", leadership: false, major: null, year: null, page: 1 },
    1_000_000,
  );
  return members;
}

export interface DirectoryFacets {
  majors: string[];
  years: number[];
}

/**
 * The values the filter menus offer: only majors and years that at least one
 * public profile has, so no option leads to an empty list. Cached for an hour;
 * a new major appearing late costs one stale menu, nothing more.
 */
export async function getDirectoryFacets(): Promise<DirectoryFacets> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 3600, expire: 86_400 });

  const [majors, years] = await Promise.all([
    db.execute<{ major: string }>(
      sql`select distinct m as major from platform."publicProfiles", unnest(majors) as m order by m`,
    ),
    db
      .selectDistinct({ year: publicProfiles.graduationYear })
      .from(publicProfiles)
      .orderBy(asc(publicProfiles.graduationYear)),
  ]);
  return {
    majors: Array.from(majors, (row) => row.major),
    years: years.flatMap((row) => (row.year === null ? [] : [row.year])),
  };
}

/**
 * The public handle of each given account that has a public profile, keyed by
 * user id. Accounts the view drops are simply absent, so a caller links
 * exactly the people who have a page to link to (the directory uses this to
 * link officers, who are listed whether or not they are public).
 *
 * Server-side only: the result is keyed by `userId`. Look values up and pass
 * the handle on; never forward the map to a client component.
 */
export const getPublicHandlesByUserId = cache(
  async (userIds: readonly string[]): Promise<Map<string, string>> => {
    if (userIds.length === 0) return new Map();
    const rows = await db
      .select({ userId: publicProfiles.userId, handle: publicProfiles.handle })
      .from(publicProfiles)
      .where(inArray(publicProfiles.userId, [...userIds]));
    return new Map(rows.map((row) => [row.userId!, row.handle!]));
  },
);

export interface PublicProfileLink {
  title: string;
  url: string;
}

/**
 * The activity sections of a public profile. Each section is `null` when the
 * member hides it, and the query for it is never run; an empty array means
 * shown but nothing to show.
 */
export interface PublicProfileActivity {
  links: PublicProfileLink[] | null;
  stars: StarTotals | null;
  /** Merged pull requests in public DevDogs repositories, newest first. */
  contributions: ContributionItem[] | null;
}

/**
 * Links, star totals and merged pull requests for a public profile, each gated on its own
 * visibility flag. Null when the handle is not a public profile (resolved
 * through the view, so the visibility rule is not repeated).
 *
 * Attendance, streak and reflections are not read here and must never be.
 */
export const getPublicProfileActivity = cache(
  async (handle: string): Promise<PublicProfileActivity | null> => {
    const [member] = await db
      .select({
        userId: publicProfiles.userId,
        showLinks: publicProfiles.showLinks,
        showStars: publicProfiles.showStars,
        showContributions: publicProfiles.showContributions,
      })
      .from(publicProfiles)
      .where(eq(publicProfiles.handle, handle.trim().toLowerCase()));
    if (!member) return null;
    const userId = member.userId!;

    const [links, stars, contributions] = await Promise.all([
      member.showLinks
        ? db
            .select({ title: profileLinks.title, url: profileLinks.url })
            .from(profileLinks)
            .where(eq(profileLinks.userId, userId))
            .orderBy(asc(profileLinks.sortOrder))
        : null,
      member.showStars
        ? getStarsForUser(userId).then((cells) => totalStars(cells))
        : null,
      member.showContributions
        ? getContributionsForUser(userId, { publicOnly: true })
        : null,
    ]);

    return { links, stars, contributions };
  },
);

export type HandleOptionKind =
  | "github"
  | "discord"
  | "myid"
  | "legal_full"
  | "legal_initial"
  | "preferred_full"
  | "preferred_initial"
  | "suffixed";

// A type alias, not an interface: `db.execute<T>` needs T to have an index
// signature, which only aliases get implicitly.
export type HandleOption = {
  kind: HandleOptionKind;
  handle: string;
  /** False when another member holds it. The member's own handle is available. */
  available: boolean;
};

export interface HandleChoices {
  /** The member's current handle, or null if they have not chosen one. */
  current: string | null;
  /** In the order to show them. Empty if the profile has no usable names. */
  options: HandleOption[];
}

/**
 * What a member may pick as their handle, from `platform.handle_options`, the
 * same function the migration's backfill used and `setHandle` validates
 * against. Only ever call it with the signed-in member's own id: the SQL
 * function refuses any other caller that carries a JWT, but the server
 * connection does not, so the guard here is the caller passing the session's
 * id and nothing else.
 */
export const getHandleOptions = cache(
  async (userId: string): Promise<HandleChoices> => {
    const [options, [profile]] = await Promise.all([
      db.execute<HandleOption>(
        sql`select kind, handle, available from platform.handle_options(${userId}::uuid)`,
      ),
      db.execute<{ handle: string | null }>(
        sql`select handle from platform.profile where "userId" = ${userId}::uuid`,
      ),
    ]);
    return {
      current: profile?.handle ?? null,
      options: Array.from(options),
    };
  },
);
