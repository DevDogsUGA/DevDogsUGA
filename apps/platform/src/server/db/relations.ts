import { defineRelations } from "drizzle-orm";
import * as schema from "./schema/generated/schema";
import { resolvedUserPermissions } from "./schema";
import * as supabase from "~/supabase/drizzle/schema";

export const relations = defineRelations(
  { ...supabase, ...schema, resolvedUserPermissions },
  (r) => ({
    usersInAuth: {
      profile: r.one.profile({
        from: r.usersInAuth.id,
        to: r.profile.userId,
        optional: false,
      }),
      identities: r.many.identitiesInAuth({
        from: r.usersInAuth.id,
        to: r.identitiesInAuth.userId,
      }),
      githubIdentity: r.one.identitiesInAuth({
        from: r.usersInAuth.id,
        to: r.identitiesInAuth.userId,
        where: { provider: "github" },
      }),
      discordIdentity: r.one.identitiesInAuth({
        from: r.usersInAuth.id,
        to: r.identitiesInAuth.userId,
        where: { provider: "discord" },
      }),
      linkedinIdentity: r.one.identitiesInAuth({
        from: r.usersInAuth.id,
        to: r.identitiesInAuth.userId,
        where: { provider: "linkedin_oidc" },
      }),
      leaderboardProfile: r.one.leaderboardProfiles({
        from: r.usersInAuth.id.through(r.identitiesInAuth.userId),
        to: r.leaderboardProfiles.githubId.through(
          r.identitiesInAuth.providerId,
        ),
      }),
      testAccounts: r.many.oauthTestAccounts({
        from: r.usersInAuth.id,
        to: r.oauthTestAccounts.ownerUserId,
      }),
      // Many, not one: migration 32 dropped `oauthRegistrations.userId`'s
      // unique constraint so a member can hold one client per project
      // instead of a single shared one. Call sites that used to read
      // `.oauthRegistration` (singular) now read `.oauthRegistrations` and
      // decide for themselves whether they want "any of them" or a specific
      // one filtered by a `where`.
      oauthRegistrations: r.many.oauthRegistrations({
        from: r.usersInAuth.id,
        to: r.oauthRegistrations.userId,
      }),
      userRoles: r.many.userRoles({
        from: r.usersInAuth.id,
        to: r.userRoles.userId,
      }),
      resolvedPermissions: r.one.resolvedUserPermissions({
        from: r.usersInAuth.id,
        to: r.resolvedUserPermissions.userId,
        optional: false,
      }),
      userSuspensions: r.many.userSuspensions({
        from: r.usersInAuth.id,
        to: r.userSuspensions.userId,
      }),
    },
    identitiesInAuth: {
      user: r.one.usersInAuth({
        from: r.identitiesInAuth.userId,
        to: r.usersInAuth.id,
        optional: false,
      }),
    },
    profile: {
      authUser: r.one.usersInAuth({
        from: r.profile.userId,
        to: r.usersInAuth.id,
        optional: false,
      }),
      links: r.many.profileLinks({
        from: r.profile.userId,
        to: r.profileLinks.userId,
      }),
      academicPrograms: r.many.profileAcademicPrograms({
        from: r.profile.userId,
        to: r.profileAcademicPrograms.userId,
      }),
      oauthRegistrations: r.many.oauthRegistrations({
        from: r.profile.userId,
        to: r.oauthRegistrations.userId,
      }),
    },
    profileLinks: {
      profile: r.one.profile({
        from: r.profileLinks.userId,
        to: r.profile.userId,
        optional: false,
      }),
    },
    profileAcademicPrograms: {
      profile: r.one.profile({
        from: r.profileAcademicPrograms.userId,
        to: r.profile.userId,
        optional: false,
      }),
      program: r.one.academicPrograms({
        from: r.profileAcademicPrograms.programId,
        to: r.academicPrograms.id,
        optional: false,
      }),
    },
    academicPrograms: {
      profiles: r.many.profileAcademicPrograms({
        from: r.academicPrograms.id,
        to: r.profileAcademicPrograms.programId,
      }),
    },
    oauthRegistrations: {
      profile: r.one.profile({
        from: r.oauthRegistrations.userId,
        to: r.profile.userId,
        optional: false,
      }),
      authorizations: r.many.oauthAuthorizationsInAuth({
        from: r.oauthRegistrations.clientId,
        to: r.oauthAuthorizationsInAuth.clientId,
      }),
      connectCodes: r.many.oauthConnectCodes({
        from: r.oauthRegistrations.clientId,
        to: r.oauthConnectCodes.clientId,
      }),
    },
    oauthConnectCodes: {
      registration: r.one.oauthRegistrations({
        from: r.oauthConnectCodes.clientId,
        to: r.oauthRegistrations.clientId,
        optional: false,
      }),
      user: r.one.usersInAuth({
        from: r.oauthConnectCodes.userId,
        to: r.usersInAuth.id,
        optional: false,
      }),
    },
    apps: {
      reports: r.many.reports({
        from: r.apps.id,
        to: r.reports.appId,
      }),
    },
    oauthTestAccounts: {
      user: r.one.usersInAuth({
        from: r.oauthTestAccounts.testUserId,
        to: r.usersInAuth.id,
        optional: false,
      }),
    },
    leaderboardProfiles: {
      points: r.many.points({
        from: r.leaderboardProfiles.githubId,
        to: r.points.leaderboardProfileId,
      }),
    },
    oauthAuthorizationsInAuth: {
      oauthRegistrations: r.one.oauthRegistrations({
        from: r.oauthAuthorizationsInAuth.clientId,
        to: r.oauthRegistrations.clientId,
        optional: false,
      }),
    },
    reports: {
      resolution: r.one.reportResolutions({
        from: r.reports.id,
        to: r.reportResolutions.reportId,
        optional: true,
      }),
      corroborations: r.many.reportCorroborations({
        from: r.reports.id,
        to: r.reportCorroborations.reportId,
      }),
      app: r.one.apps({
        from: r.reports.appId,
        to: r.apps.id,
        optional: false,
      }),
      // `reasonDetail`, not `reason`: drizzle rejects a relation whose name
      // collides with a column on the same table, and `reports.reason` is the
      // enum column this joins FROM. The collision throws inside
      // `defineRelations` at module load, so it took down every route that
      // reaches the database rather than the one that reads the relation.
      reasonDetail: r.one.reportReasons({
        from: r.reports.reason,
        to: r.reportReasons.reason,
        optional: false,
      }),
    },
    reportResolutions: {
      report: r.one.reports({
        from: r.reportResolutions.reportId,
        to: r.reports.id,
        optional: false,
      }),
    },
    reportCorroborations: {
      report: r.one.reports({
        from: r.reportCorroborations.reportId,
        to: r.reports.id,
        optional: false,
      }),
      // Same collision as on `reports` above.
      reasonDetail: r.one.reportReasons({
        from: r.reportCorroborations.reason,
        to: r.reportReasons.reason,
        optional: false,
      }),
    },
    userRoles: {
      user: r.one.usersInAuth({
        from: r.userRoles.userId,
        to: r.usersInAuth.id,
        optional: false,
      }),
      role: r.one.roles({
        from: r.userRoles.roleId,
        to: r.roles.id,
        optional: false,
      }),
    },
    resolvedUserPermissions: {
      user: r.one.usersInAuth({
        from: r.resolvedUserPermissions.userId,
        to: r.usersInAuth.id,
        optional: false,
      }),
    },
    roles: {
      userRoles: r.many.userRoles({
        from: r.roles.id,
        to: r.userRoles.roleId,
      }),
    },
    userSuspensions: {
      user: r.one.usersInAuth({
        from: r.userSuspensions.userId,
        to: r.usersInAuth.id,
        optional: false,
      }),
    },
  }),
);
