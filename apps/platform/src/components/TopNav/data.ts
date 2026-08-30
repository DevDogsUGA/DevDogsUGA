import { cache } from "react";
import { canSeeCredentialsPage } from "~/server/actions/credentials";
import {
  getCallerContext,
  getHighestRankingRole,
  type HighestRankingRole,
  type ResolvedPermissions,
} from "~/server/actions/permissions";
import { expectUserWith } from "~/server/auth";
import type { profiles } from "~/server/db/schema";
import {
  getInvolvementFullName,
  getVerificationStatus,
} from "~/server/loaders/verification";
import type { VerificationData } from "./NavUserProvider";

export interface NavUser {
  profile: typeof profiles.$inferSelect;
  permissions: ResolvedPermissions | null;
  credentialsAccess: boolean;
  highestRole: HighestRankingRole;
  verification: VerificationData | null;
}

/**
 * The single per-request read backing every navbar surface. Wrapped in React's
 * `cache()` (not `"use cache"`: it reads auth cookies) so the streamed
 * console, profile, and mobile clusters share one lookup.
 */
export const getNavUser = cache(async (): Promise<NavUser | null> => {
  const user = await expectUserWith({ profile: true }).catch(() => null);
  if (!user?.profile) return null;

  const [callerContext, credentialsAccess, highestRole, verificationStatus] =
    await Promise.all([
      getCallerContext(user.id).catch(() => null),
      canSeeCredentialsPage(user.id).catch(() => false),
      getHighestRankingRole(user.id),
      getVerificationStatus(user.id).catch(() => null),
    ]);

  return {
    profile: user.profile,
    permissions: callerContext?.resolvedPermissions ?? null,
    credentialsAccess,
    highestRole: highestRole ?? { title: "Member", color: null },
    verification: verificationStatus
      ? {
          userId: user.id,
          verificationStatus: verificationStatus.verificationStatus,
          isVerified: verificationStatus.isVerified,
          involvementFullName: getInvolvementFullName(user.profile),
        }
      : null,
  };
});
