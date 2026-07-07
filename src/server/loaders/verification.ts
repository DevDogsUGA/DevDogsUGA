import { eq } from "drizzle-orm";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { canUserManageVerification } from "~/server/actions/permissions";
import { expectSession } from "~/server/auth";
import { db } from "~/server/db";
import { profileWithVerification, profiles } from '~/server/db/schema';

export const getVerificationPageData = cache(async () => {
  const userId = await expectSession().catch(() => redirect("/auth"));
  if (!(await canUserManageVerification(userId))) notFound();
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

  // Drizzle infers SQL expression columns as `{}` — cast explicitly to boolean.
  const verificationStatus: VerificationStatus = {
    hasPronouns: Boolean(row?.hasPronouns),
    hasGraduationDate: Boolean(row?.hasGraduationDate),
    hasGithub: Boolean(row?.hasGithub),
    hasDiscord: Boolean(row?.hasDiscord),
    nameMatchesInvolvement: Boolean(row?.nameMatchesInvolvement),
  };

  return { verificationStatus, isVerified: Boolean(row?.verified) };
});

/** Same logic as the inline computation previously in `getProfilePageData`. */
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
