import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { cache } from "react";
import { env } from "~/env";
import { db } from "~/server/db";
import {
  competitionEntries,
  competitions,
  profileLinks,
  publicProfiles,
  teamMembers,
  teams,
} from "~/server/db/schema";
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
  competitions: boolean;
  contributions: boolean;
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
  visibility: PublicProfileVisibility;
}

/** One row of the `/community` directory. */
export interface PublicProfileSummary {
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
}

/** An invite-picker hit. The only public-profile shape that carries `userId`. */
export interface PublicProfileMatch {
  userId: string;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
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
    visibility: {
      name: row.showName!,
      avatar: row.showAvatar!,
      bio: row.showBio!,
      links: row.showLinks!,
      competitions: row.showCompetitions!,
      contributions: row.showContributions!,
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

/**
 * Every public profile, for the directory, alphabetical by what is shown
 * (display name, falling back to handle). Unpaginated: the club has a few
 * hundred verified members, and the page needs the whole list to filter
 * client-side. Paginate here before that stops being true.
 */
export const listPublicProfiles = cache(
  async (): Promise<PublicProfileSummary[]> => {
    const rows = await db
      .select({
        userId: publicProfiles.userId,
        handle: publicProfiles.handle,
        displayName: publicProfiles.displayName,
        hasAvatar: publicProfiles.hasAvatar,
        bio: publicProfiles.bio,
      })
      .from(publicProfiles)
      .orderBy(
        asc(
          sql`lower(coalesce(${publicProfiles.displayName}, ${publicProfiles.handle}))`,
        ),
      );
    return rows.map((row) => ({
      handle: row.handle!,
      displayName: row.displayName,
      avatarUrl: row.hasAvatar ? avatarUrlFor(row.userId!) : null,
      bio: row.bio,
    }));
  },
);

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

/**
 * The directory row of each given account that has a public profile, keyed by
 * user id. Like `getPublicHandlesByUserId` but with the name and avatar a list
 * of people needs; hidden fields are already null, and accounts the view drops
 * are absent.
 *
 * Server-side only: the result is keyed by `userId`. Look values up and pass
 * the summary on; never forward the map to a client component.
 */
export const getPublicSummariesByUserId = cache(
  async (
    userIds: readonly string[],
  ): Promise<Map<string, PublicProfileSummary>> => {
    if (userIds.length === 0) return new Map();
    const rows = await db
      .select({
        userId: publicProfiles.userId,
        handle: publicProfiles.handle,
        displayName: publicProfiles.displayName,
        hasAvatar: publicProfiles.hasAvatar,
        bio: publicProfiles.bio,
      })
      .from(publicProfiles)
      .where(inArray(publicProfiles.userId, [...userIds]));
    return new Map(
      rows.map((row) => [
        row.userId!,
        {
          handle: row.handle!,
          displayName: row.displayName,
          avatarUrl: row.hasAvatar ? avatarUrlFor(row.userId!) : null,
          bio: row.bio,
        },
      ]),
    );
  },
);

const SEARCH_LIMIT_MAX = 25;

/** Escape `%`, `_` and `\` so user input is matched literally by LIKE. */
function likeEscape(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * Prefix search for the team invite picker: a public profile matches when the
 * query is a prefix of its handle, of its displayed name, or of any word of the
 * displayed name. A hidden name is NULL in the view and so never matches, which
 * keeps "search for the name I hid" from finding me.
 *
 * Returns `userId`, because an invite names an account. This is server-side
 * only: do not forward the raw match to a client component; map it to what the
 * picker renders and keep the id behind the invite action.
 */
export const searchPublicProfiles = cache(
  async (query: string, limit = 8): Promise<PublicProfileMatch[]> => {
    const q = query.trim().replace(/^@/, "").toLowerCase();
    if (q.length === 0) return [];
    const pattern = `${likeEscape(q)}%`;
    const wordPattern = `% ${likeEscape(q)}%`;

    const rows = await db
      .select({
        userId: publicProfiles.userId,
        handle: publicProfiles.handle,
        displayName: publicProfiles.displayName,
        hasAvatar: publicProfiles.hasAvatar,
      })
      .from(publicProfiles)
      .where(
        sql`${publicProfiles.handle} like ${pattern}
          or lower(${publicProfiles.displayName}) like ${pattern}
          or lower(${publicProfiles.displayName}) like ${wordPattern}`,
      )
      // Handle matches first (exact, then prefix), so typing a full handle
      // puts that member on top.
      .orderBy(
        desc(sql`${publicProfiles.handle} = ${q}`),
        asc(
          sql`lower(coalesce(${publicProfiles.displayName}, ${publicProfiles.handle}))`,
        ),
      )
      .limit(Math.min(Math.max(Math.trunc(limit), 1), SEARCH_LIMIT_MAX));

    return rows.map((row) => ({
      userId: row.userId!,
      handle: row.handle!,
      displayName: row.displayName,
      avatarUrl: row.hasAvatar ? avatarUrlFor(row.userId!) : null,
    }));
  },
);

export interface PublicProfileLink {
  title: string;
  url: string;
}

/** One competition the member entered, with the team they entered under. */
export interface PublicCompetitionEntry {
  competitionSlug: string;
  competitionTitle: string;
  teamSlug: string;
  teamName: string;
  /** The team had an entry merged in this competition. */
  won: boolean;
  /** When the earliest qualifying entry opened. */
  enteredAt: Date;
}

/** One merged pull request credited to the member through a team. */
export interface PublicContribution {
  prNumber: number;
  url: string;
  mergedAt: Date;
  competitionSlug: string;
  competitionTitle: string;
  teamSlug: string;
  teamName: string;
}

/**
 * The activity sections of a public profile. Each section is `null` when the
 * member hides it, and the query for it is never run; an empty array means
 * shown but nothing to show.
 */
export interface PublicProfileActivity {
  links: PublicProfileLink[] | null;
  competitions: PublicCompetitionEntry[] | null;
  contributions: PublicContribution[] | null;
  stars: StarTotals | null;
}

/**
 * Links, competitions, merged contributions and star totals for a public
 * profile, each gated on its own visibility flag. Null when the handle is not
 * a public profile (resolved through the view, so the visibility rule is not
 * repeated).
 *
 * "Belongs to the team" means what `memberStars` means: an active membership
 * at the moment the entry's pull request opened (`joinedAt <= openedAt` and not
 * yet left), and the entry opened before the competition closed. So somebody
 * who joins a team after it already won does not inherit the win, and the
 * totals here agree with the star totals.
 *
 * Attendance, streak and reflections are not read here and must never be.
 */
export const getPublicProfileActivity = cache(
  async (handle: string): Promise<PublicProfileActivity | null> => {
    const [member] = await db
      .select({
        userId: publicProfiles.userId,
        showLinks: publicProfiles.showLinks,
        showCompetitions: publicProfiles.showCompetitions,
        showContributions: publicProfiles.showContributions,
        showStars: publicProfiles.showStars,
      })
      .from(publicProfiles)
      .where(eq(publicProfiles.handle, handle.trim().toLowerCase()));
    if (!member) return null;
    const userId = member.userId!;

    // The membership predicate shared by competitions and contributions; see
    // the doc comment above.
    const qualifyingEntries = and(
      eq(teamMembers.userId, userId),
      sql`${teamMembers.joinedAt} <= ${competitionEntries.openedAt}`,
      sql`(${teamMembers.leftAt} is null or ${teamMembers.leftAt} > ${competitionEntries.openedAt})`,
      sql`(${competitions.closedAt} is null or ${competitionEntries.openedAt} < ${competitions.closedAt})`,
    );

    const [links, entered, contributions, stars] = await Promise.all([
      member.showLinks
        ? db
            .select({ title: profileLinks.title, url: profileLinks.url })
            .from(profileLinks)
            .where(eq(profileLinks.userId, userId))
            .orderBy(asc(profileLinks.sortOrder))
        : null,
      member.showCompetitions
        ? db
            .select({
              competitionSlug: competitions.slug,
              competitionTitle: competitions.title,
              teamSlug: teams.slug,
              teamName: teams.name,
              won: sql<boolean>`bool_or(${competitionEntries.mergedAt} is not null)`,
              enteredAt: sql<Date>`min(${competitionEntries.openedAt})`,
            })
            .from(competitionEntries)
            .innerJoin(
              competitions,
              eq(competitions.id, competitionEntries.competitionId),
            )
            .innerJoin(teams, eq(teams.id, competitionEntries.teamId))
            .innerJoin(teamMembers, eq(teamMembers.teamId, teams.id))
            .where(qualifyingEntries)
            .groupBy(
              competitions.id,
              competitions.slug,
              competitions.title,
              teams.id,
              teams.slug,
              teams.name,
            )
            .orderBy(desc(sql`min(${competitionEntries.openedAt})`))
        : null,
      member.showContributions
        ? db
            .select({
              prNumber: competitionEntries.prNumber,
              url: competitionEntries.url,
              mergedAt: competitionEntries.mergedAt,
              competitionSlug: competitions.slug,
              competitionTitle: competitions.title,
              teamSlug: teams.slug,
              teamName: teams.name,
            })
            .from(competitionEntries)
            .innerJoin(
              competitions,
              eq(competitions.id, competitionEntries.competitionId),
            )
            .innerJoin(teams, eq(teams.id, competitionEntries.teamId))
            .innerJoin(teamMembers, eq(teamMembers.teamId, teams.id))
            .where(
              and(
                qualifyingEntries,
                sql`${competitionEntries.mergedAt} is not null`,
              ),
            )
            .orderBy(desc(competitionEntries.mergedAt))
        : null,
      member.showStars
        ? getStarsForUser(userId).then((cells) => totalStars(cells))
        : null,
    ]);

    return {
      links,
      competitions:
        entered?.map((row) => ({
          ...row,
          enteredAt: new Date(row.enteredAt),
        })) ?? null,
      contributions:
        contributions?.map((row) => ({
          ...row,
          mergedAt: row.mergedAt!,
        })) ?? null,
      stars,
    };
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
