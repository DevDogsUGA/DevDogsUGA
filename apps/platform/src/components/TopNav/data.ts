import { cache } from "react";
import { visibleConsoleItems } from "~/config/nav";
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
import type { MeResponse, VerificationData } from "./NavUserProvider";

export interface NavUser {
  profile: typeof profiles.$inferSelect;
  permissions: ResolvedPermissions | null;
  credentialsAccess: boolean;
  highestRole: HighestRankingRole;
  verification: VerificationData | null;
}

/**
 * The single per-request read backing every navbar surface. It reads auth
 * cookies, so it never runs during a page render (that would make the page
 * uncacheable, or cache one visitor's nav for everyone). `GET /me` serves it
 * to the browser; see `toMeResponse`. Wrapped in React's `cache()` so a
 * server component that does need it shares one lookup per render.
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

/**
 * What `GET /me` sends: only what the navbar and the verification checklist
 * render. Console items are filtered here, so a browser only ever receives the
 * pages its viewer may see.
 */
export function toMeResponse(user: NavUser | null): MeResponse {
  if (!user) return null;
  return {
    user: {
      profile: {
        userId: user.profile.userId,
        preferredName: user.profile.preferredName,
      },
      highestRole: user.highestRole,
    },
    verification: user.verification,
    consoleItems: visibleConsoleItems(user.permissions, user.credentialsAccess),
  };
}
