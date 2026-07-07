import { defineRelations } from "drizzle-orm";
import * as schema from "./schema/generated/schema";
import { resolvedUserPermissions } from "./schema";
import * as supabase from "~/supabase/drizzle/schema";

export const relations = defineRelations({ ...supabase, ...schema, resolvedUserPermissions }, (r) => ({
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
      to: r.leaderboardProfiles.githubId.through(r.identitiesInAuth.providerId),
    }),
    testAccounts: r.many.oauthTestAccounts({
      from: r.usersInAuth.id,
      to: r.oauthTestAccounts.ownerUserId,
    }),
    oauthRegistration: r.one.oauthRegistrations({
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
    oauthRegistration: r.one.oauthRegistrations({
      from: r.profile.userId,
      to: r.oauthRegistrations.userId,
      optional: true,
    }),
  },
  profileLinks: {
    profile: r.one.profile({
      from: r.profileLinks.userId,
      to: r.profile.userId,
      optional: false,
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
    contentReports: r.many.contentReports({
      from: r.oauthRegistrations.clientId,
      to: r.contentReports.clientId,
    }),
    moderatorRoles: r.many.moderatorRoles({
      from: r.oauthRegistrations.clientId,
      to: r.moderatorRoles.clientId,
    }),
    feedbackTopics: r.many.feedbackTopics({
      from: r.oauthRegistrations.clientId,
      to: r.feedbackTopics.clientId,
    }),
  },
  feedbackTopics: {
    oauthRegistration: r.one.oauthRegistrations({
      from: r.feedbackTopics.clientId,
      to: r.oauthRegistrations.clientId,
      optional: false,
    }),
  },
  siteFeedback: {
    oauthRegistration: r.one.oauthRegistrations({
      from: r.siteFeedback.clientId,
      to: r.oauthRegistrations.clientId,
      optional: true,
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
  contentReports: {
    resolution: r.one.reportResolutions({
      from: r.contentReports.id,
      to: r.reportResolutions.reportId,
      optional: true,
    }),
    corroborations: r.many.reportCorroborations({
      from: r.contentReports.id,
      to: r.reportCorroborations.reportId,
    }),
    oauthRegistration: r.one.oauthRegistrations({
      from: r.contentReports.clientId,
      to: r.oauthRegistrations.clientId,
      optional: false,
    }),
    reason: r.one.reportReasons({
      from: r.contentReports.reasonId,
      to: r.reportReasons.id,
      optional: false,
    }),
    contentType: r.one.reportContentTypes({
      from: r.contentReports.contentTypeId,
      to: r.reportContentTypes.id,
      optional: true,
    }),
  },
  reportResolutions: {
    report: r.one.contentReports({
      from: r.reportResolutions.reportId,
      to: r.contentReports.id,
      optional: false,
    }),
  },
  reportCorroborations: {
    report: r.one.contentReports({
      from: r.reportCorroborations.reportId,
      to: r.contentReports.id,
      optional: false,
    }),
    reason: r.one.reportReasons({
      from: r.reportCorroborations.reasonId,
      to: r.reportReasons.id,
      optional: false,
    }),
  },
  reportReasons: {
    oauthRegistration: r.one.oauthRegistrations({
      from: r.reportReasons.clientId,
      to: r.oauthRegistrations.clientId,
      optional: false,
    }),
  },
  reportContentTypes: {
    oauthRegistration: r.one.oauthRegistrations({
      from: r.reportContentTypes.clientId,
      to: r.oauthRegistrations.clientId,
      optional: false,
    }),
  },
  moderatorRoles: {
    user: r.one.usersInAuth({
      from: r.moderatorRoles.userId,
      to: r.usersInAuth.id,
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
    credentialRoles: r.many.credentialRoles({
      from: r.roles.id,
      to: r.credentialRoles.roleId,
    }),
  },
  credentialRoles: {
    role: r.one.roles({
      from: r.credentialRoles.roleId,
      to: r.roles.id,
      optional: false,
    }),
    credential: r.one.credentials({
      from: r.credentialRoles.credentialId,
      to: r.credentials.id,
      optional: false,
    }),
  },
  credentials: {
    credentialRoles: r.many.credentialRoles({
      from: r.credentials.id,
      to: r.credentialRoles.credentialId,
    }),
  },
  userSuspensions: {
    user: r.one.usersInAuth({
      from: r.userSuspensions.userId,
      to: r.usersInAuth.id,
      optional: false,
    }),
  },
  docsRepos: {
    branches: r.many.docsBranches({
      from: r.docsRepos.id,
      to: r.docsBranches.repoId,
    }),
  },
  docsBranches: {
    repo: r.one.docsRepos({
      from: r.docsBranches.repoId,
      to: r.docsRepos.id,
      optional: false,
    }),
    pages: r.many.docsPages({
      from: r.docsBranches.id,
      to: r.docsPages.branchId,
    }),
  },
  docsPages: {
    branch: r.one.docsBranches({
      from: r.docsPages.branchId,
      to: r.docsBranches.id,
      optional: false,
    }),
  },
}));
