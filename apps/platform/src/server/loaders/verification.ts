import { eq } from "drizzle-orm";
import { cache } from "react";
import { canUserManageVerification } from "~/server/actions/permissions";
import { requirePermission } from "~/server/auth/require";
import { db } from "~/server/db";
import { profileWithVerification, type profiles } from "~/server/db/schema";

/**
 * The verification console's gate.
 *
 * Was `getVerificationPageData`, which returned no data at all: the page
 * called it for its side effect while reading as though it awaited something.
 */
export const requireVerificationAccess = cache(async () => {
  await requirePermission(canUserManageVerification);
});

// ── Profile verification checklist ───────────────────────────────────────────

/** Number of criteria tracked by `VerificationStatus` / the checklist UI. */
export const VERIFICATION_TOTAL = 5;

export interface VerificationStatus {
  hasPronouns: boolean;
  hasGraduationDate: boolean;
  hasGithub: boolean;
  hasDiscord: boolean;
  nameMatchesInvolvement: boolean;
}

/**
 * Reads the per-criterion verification booleans from the
 * `profileWithVerification` view (computed live from `profiles` +
 * `auth.identities`, see `src/server/db/schema/public.ts`).
 */
export const getVerificationStatus = cache(async (userId: string) => {
  const [row] = await db
    .select({
      hasPronouns: profileWithVerification.hasPronouns,
      hasGraduationDate: profileWithVerification.hasGraduationDate,
      hasGithub: profileWithVerification.hasGithub,
      hasDiscord: profileWithVerification.hasDiscord,
      nameMatchesInvolvement: profileWithVerification.nameMatchesInvolvement,
      verified: profileWithVerification.verified,
    })
    .from(profileWithVerification)
    .where(eq(profileWithVerification.userId, userId))
    .limit(1);

  // Drizzle infers SQL expression columns as `{}`, so cast to boolean.
  const verificationStatus: VerificationStatus = {
    hasPronouns: Boolean(row?.hasPronouns),
    hasGraduationDate: Boolean(row?.hasGraduationDate),
    hasGithub: Boolean(row?.hasGithub),
    hasDiscord: Boolean(row?.hasDiscord),
    nameMatchesInvolvement: Boolean(row?.nameMatchesInvolvement),
  };

  return { verificationStatus, isVerified: Boolean(row?.verified) };
});

/** The member's Involvement Network full name, or null when they have none. */
export function getInvolvementFullName(
  profile: Pick<
    typeof profiles.$inferSelect,
    "involvementFirstName" | "involvementLastName"
  >,
): string | null {
  return profile.involvementFirstName != null
    ? `${profile.involvementFirstName} ${profile.involvementLastName}`
    : null;
}
