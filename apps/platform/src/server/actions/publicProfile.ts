"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { COMMUNITY_PATH, profilePath } from "~/lib/profilePath";
import {
  PUBLIC_PROFILE_FIELDS,
  type PublicProfileField,
  type PublicProfileSwitches,
} from "~/lib/publicProfileFields";
import { db } from "~/server/db";
import { profiles } from "~/server/db/schema";
import { publicProfilesEnabled } from "~/server/features";
import { getVerificationStatus } from "~/server/loaders/verification";
import {
  getHandleOptions,
  type HandleChoices,
} from "~/server/loaders/publicProfiles";
import { consumeRateLimit } from "~/server/rateLimit";
import { authenticate, expectSession } from "../auth";

export interface PublicProfileSettings extends HandleChoices {
  isVerified: boolean;
  switches: PublicProfileSwitches;
}

export type SetPublicProfileOutcome =
  | { status: "set" }
  /** Quarantined or suspended members cannot edit their profile. */
  | { status: "blocked" }
  | { status: "rate_limited" };

/** Thirty flips per ten minutes: generous for a settings page, closed to a script. */
const VISIBILITY_LIMIT = 30;
const VISIBILITY_WINDOW_SECONDS = 10 * 60;

async function sessionUserId(): Promise<string> {
  return expectSession().catch(() => authenticate("google", "/account"));
}

/**
 * Drops the cached pages a visibility change shows up on: the directory and
 * the member's own profile, both of which use `revalidate` page caching and
 * would otherwise keep serving the old answer until the period lapsed.
 */
function revalidatePublicPages(handle: string | null | undefined) {
  revalidatePath(COMMUNITY_PATH);
  if (handle) revalidatePath(profilePath(handle));
  revalidatePath("/account");
}

/**
 * Everything the public-profile controls need for the signed-in member, for
 * the verification dialog, which lives in the navbar and so cannot take it as
 * a prop from a page. `/account` reads the same pieces directly.
 *
 * Null while public profiles are switched off, which hides the step.
 */
export async function getPublicProfileSettings(): Promise<PublicProfileSettings | null> {
  if (!publicProfilesEnabled()) return null;
  const userId = await sessionUserId();
  const [choices, { isVerified }, [row]] = await Promise.all([
    getHandleOptions(userId),
    getVerificationStatus(userId),
    db
      .select({
        publicProfile: profiles.publicProfile,
        showName: profiles.showName,
        showAvatar: profiles.showAvatar,
        showBio: profiles.showBio,
        showLinks: profiles.showLinks,
        showCompetitions: profiles.showCompetitions,
        showContributions: profiles.showContributions,
        showStars: profiles.showStars,
      })
      .from(profiles)
      .where(eq(profiles.userId, userId)),
  ]);
  return {
    ...choices,
    isVerified,
    switches: row ?? {
      publicProfile: true,
      showName: true,
      showAvatar: true,
      showBio: true,
      showLinks: true,
      showCompetitions: true,
      showContributions: true,
      showStars: true,
    },
  };
}

/** Just the handle options, for the picker to re-read after a lost race. */
export async function getMyHandleChoices(): Promise<HandleChoices> {
  if (!publicProfilesEnabled()) throw new Error("Public profiles are off");
  return getHandleOptions(await sessionUserId());
}

/**
 * Flips one public-profile switch for the signed-in member.
 *
 * Written here rather than through the browser client so the pages that show
 * the change can be revalidated in the same step. The write is refused for a
 * quarantined or suspended member, as RLS refuses it from the browser; this
 * connection bypasses RLS, so the check is restated in the `where`.
 * Who is actually listed is decided by the `publicProfiles` view, never here.
 */
export async function setPublicProfileField(
  field: PublicProfileField,
  value: boolean,
): Promise<SetPublicProfileOutcome> {
  if (!PUBLIC_PROFILE_FIELDS.includes(field) || typeof value !== "boolean") {
    throw new Error(`Unknown public profile field: ${String(field)}`);
  }
  if (!publicProfilesEnabled()) throw new Error("Public profiles are off");
  const userId = await sessionUserId();

  const allowed = await consumeRateLimit({
    scope: "profile:visibility",
    subjectId: userId,
    limit: VISIBILITY_LIMIT,
    windowSeconds: VISIBILITY_WINDOW_SECONDS,
  });
  if (!allowed) return { status: "rate_limited" };

  const [row] = await db
    .update(profiles)
    .set({ [field]: value })
    .where(
      and(
        eq(profiles.userId, userId),
        isNull(profiles.quarantinedBy),
        sql`not platform.is_suspended(${profiles.userId})`,
      ),
    )
    .returning({ handle: profiles.handle });
  if (!row) return { status: "blocked" };

  revalidatePublicPages(row.handle);
  return { status: "set" };
}

/**
 * Revalidates the member's public pages after a change made elsewhere (the
 * connected-account "show on profile" toggles write straight from the
 * browser). Takes no arguments: it only ever acts on the session's own
 * handle, so there is nothing for a caller to forge.
 */
export async function revalidateMyPublicProfile(): Promise<void> {
  const userId = await sessionUserId();
  const [row] = await db
    .select({ handle: profiles.handle })
    .from(profiles)
    .where(eq(profiles.userId, userId));
  revalidatePublicPages(row?.handle);
}
